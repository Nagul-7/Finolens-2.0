"""
Tests for the signal engine (generate_signal).

Fixtures use synthetic OHLCV series whose regime is known by construction:
a clean linear uptrend, a clean downtrend, a recent trend reversal (conflict),
a mean-reverting random walk (choppy / ADX < 20), and flat prices.

All confidence thresholds below were verified empirically against the engine
before being asserted, so they describe real behaviour, not aspiration.
"""
import logging
from datetime import date, timedelta

import numpy as np

from app.schemas import SignalRequest, OHLCVCandle
from app.engine import generate_signal, CONFIDENCE_CAP

# Engine logs a warning for < 200 candles; silence it for the edge-case test.
logging.disable(logging.WARNING)


# ─── Fixture builders ─────────────────────────────────────────────────────────

def _request(closes: list[float], spread: float = 0.5) -> SignalRequest:
    """Build a SignalRequest from closes, deriving high/low from a fixed spread."""
    start = date(2025, 1, 1)
    candles = [
        OHLCVCandle(
            date=start + timedelta(days=i),
            open=c,
            high=c + spread,
            low=c - spread,
            close=c,
            volume=1000,
        )
        for i, c in enumerate(closes)
    ]
    return SignalRequest(symbol="TEST", candles=candles)


def strong_uptrend() -> SignalRequest:
    return _request([100 + i * 1.0 for i in range(210)], spread=0.5)


def strong_downtrend() -> SignalRequest:
    return _request([300 - i * 1.0 for i in range(210)], spread=0.5)


def recent_reversal() -> SignalRequest:
    """Long uptrend then a 12-day drop: SuperTrend flips DOWN while EMAs stay
    bullish, so indicator scores cancel — ADX passes the gate but no signal."""
    up = [100 + i * 1.0 for i in range(198)]
    last = up[-1]
    drop = [last + (j + 1) * -3.0 for j in range(12)]
    return _request(up + drop, spread=1.0)


def choppy() -> SignalRequest:
    """Mean-reverting random walk around 100 — no trend, ADX well below 20."""
    rng = np.random.default_rng(0)
    closes = [100.0]
    for _ in range(209):
        closes.append(100 + 0.7 * (closes[-1] - 100) + rng.normal(0, 1.5))
    return _request(closes, spread=1.0)


def flat() -> SignalRequest:
    return _request([100.0] * 210, spread=0.5)


# ─── 1. Strong bullish → BUY, high confidence ─────────────────────────────────

def test_strong_bullish_is_buy_high_confidence():
    sig = generate_signal(strong_uptrend())
    assert sig.signal_type == "BUY"
    assert sig.confidence > 70, f"expected >70, got {sig.confidence}"
    assert sig.confidence <= CONFIDENCE_CAP


# ─── 2. Strong bearish → SELL, high confidence ────────────────────────────────

def test_strong_bearish_is_sell_high_confidence():
    sig = generate_signal(strong_downtrend())
    assert sig.signal_type == "SELL"
    assert sig.confidence > 70, f"expected >70, got {sig.confidence}"
    assert sig.confidence <= CONFIDENCE_CAP


# ─── 3. Conflicting indicators (ADX passes) → NEUTRAL ─────────────────────────

def test_conflicting_indicators_is_neutral():
    sig = generate_signal(recent_reversal())
    assert sig.signal_type == "NEUTRAL"
    # ADX gate was NOT the cause — the market is trending, scores just cancel
    assert sig.indicators.adx is not None and sig.indicators.adx >= 20


# ─── 4. ADX < 20 → NEUTRAL via the gate ───────────────────────────────────────

def test_choppy_market_gated_to_neutral():
    sig = generate_signal(choppy())
    assert sig.signal_type == "NEUTRAL"
    assert sig.confidence == 0.0
    assert sig.indicators.adx is not None and sig.indicators.adx < 20
    assert "choppy" in sig.reasoning.lower()
    # Gate short-circuits before scoring — other indicators not computed
    assert sig.indicators.rsi is None


# ─── 5. 60-candle edge case — no crash, valid response ────────────────────────

def test_minimum_candles_does_not_crash():
    sig = generate_signal(_request([100 + i * 0.5 for i in range(60)], spread=0.5))
    assert sig.signal_type in ("BUY", "SELL", "NEUTRAL")
    assert 0.0 <= sig.confidence <= CONFIDENCE_CAP
    assert sig.entry_price > 0


# ─── 6. Flat prices → NEUTRAL ─────────────────────────────────────────────────

def test_flat_prices_is_neutral():
    sig = generate_signal(flat())
    assert sig.signal_type == "NEUTRAL"
    assert sig.confidence == 0.0


# ─── 7. Stop-loss / target direction is correct ───────────────────────────────

def test_buy_stop_below_target_above_entry():
    sig = generate_signal(strong_uptrend())
    assert sig.signal_type == "BUY"
    assert sig.stop_loss is not None and sig.target is not None
    assert sig.stop_loss < sig.entry_price < sig.target
    # 3x reward vs 2x risk = 1.5:1
    risk = sig.entry_price - sig.stop_loss
    reward = sig.target - sig.entry_price
    assert reward > risk
    assert abs((reward / risk) - 1.5) < 0.01


def test_sell_stop_above_target_below_entry():
    sig = generate_signal(strong_downtrend())
    assert sig.signal_type == "SELL"
    assert sig.stop_loss is not None and sig.target is not None
    assert sig.target < sig.entry_price < sig.stop_loss
    risk = sig.stop_loss - sig.entry_price
    reward = sig.entry_price - sig.target
    assert abs((reward / risk) - 1.5) < 0.01


def test_neutral_has_no_exits():
    sig = generate_signal(choppy())
    assert sig.signal_type == "NEUTRAL"
    assert sig.stop_loss is None
    assert sig.target is None


# ─── 8. Reasoning references the major indicators ─────────────────────────────

def test_reasoning_mentions_major_indicators():
    sig = generate_signal(strong_uptrend())
    text = sig.reasoning.lower()
    for token in ("adx", "rsi", "ema", "supertrend", "macd"):
        assert token in text, f"reasoning missing '{token}': {sig.reasoning}"


def test_confidence_never_exceeds_95():
    # Even the strongest constructed trend must respect the cap
    for fixture in (strong_uptrend(), strong_downtrend()):
        sig = generate_signal(fixture)
        assert sig.confidence <= 95.0

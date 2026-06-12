"""
Signal engine — combines indicators into a single BUY/SELL/NEUTRAL signal.

Order of operations is deliberate:
  1. ADX gate first — choppy markets (ADX < 20) short-circuit to NEUTRAL
     before any scoring work is done.
  2. Score each indicator into [-1, +1].
  3. Weighted combination (EMA 30%, SuperTrend 25%, MACD 20%, RSI 15%, BB 10%).
  4. Threshold the weighted total into BUY / SELL / NEUTRAL.
  5. Confidence = |total| * 100, capped at 95 (never claim certainty).
  6. ATR-based exits at a fixed 1.5:1 reward:risk.
  7. Human-readable reasoning referencing the actual indicator values.
"""
import numpy as np

from .schemas import IndicatorSnapshot, SignalRequest, SignalResponse
from .indicators.rsi import calculate_rsi, score_rsi
from .indicators.macd import calculate_macd, score_macd
from .indicators.ema import calculate_ema, score_ema
from .indicators.adx import calculate_adx
from .indicators.bollinger import calculate_bollinger, score_bollinger
from .indicators.supertrend import calculate_supertrend
from .indicators.atr import calculate_atr

# ─── Tunables ─────────────────────────────────────────────────────────────────
ADX_TREND_THRESHOLD = 20.0      # below this = choppy, no signal
BUY_THRESHOLD = 0.4
SELL_THRESHOLD = -0.4
CONFIDENCE_CAP = 95.0

WEIGHTS = {
    "ema": 0.30,        # highest weight — most reliable trend indicator
    "supertrend": 0.25,
    "macd": 0.20,
    "rsi": 0.15,
    "bollinger": 0.10,
}

# ATR multipliers — 2x risk, 3x reward = 1.5:1 reward:risk
ATR_STOP_MULT = 2.0
ATR_TARGET_MULT = 3.0


def generate_signal(request: SignalRequest) -> SignalResponse:
    symbol = request.symbol
    closes = np.array([c.close for c in request.candles], dtype=float)
    highs = np.array([c.high for c in request.candles], dtype=float)
    lows = np.array([c.low for c in request.candles], dtype=float)
    entry = float(closes[-1])

    # ── 1. ADX GATE — reject choppy markets before scoring ───────────────────
    adx = calculate_adx(highs, lows, closes, period=14)
    if adx < ADX_TREND_THRESHOLD:
        return SignalResponse(
            symbol=symbol,
            signal_type="NEUTRAL",
            confidence=0.0,
            entry_price=round(entry, 2),
            stop_loss=None,
            target=None,
            reasoning=(
                f"No signal: market is choppy (ADX {adx:.1f} < "
                f"{ADX_TREND_THRESHOLD:.0f}). No clear trend to trade — "
                f"directional indicators are unreliable in a range. "
                f"Waiting for ADX to confirm a trend before scoring."
            ),
            indicators=IndicatorSnapshot(adx=round(adx, 2)),
        )

    # ── 2. Indicator values ───────────────────────────────────────────────────
    rsi = calculate_rsi(closes, period=14)
    macd_line, macd_signal, macd_hist = calculate_macd(closes)
    ema_20 = calculate_ema(closes, 20)
    ema_50 = calculate_ema(closes, 50)
    bb_upper, bb_middle, bb_lower = calculate_bollinger(closes)
    st_dir = calculate_supertrend(highs, lows, closes)
    atr = calculate_atr(highs, lows, closes, period=14)

    # ── 3. Scores in [-1, +1] ─────────────────────────────────────────────────
    macd_score = score_macd(macd_line, macd_signal, macd_hist)
    ema_score = score_ema(entry, ema_20, ema_50)
    bb_score, bb_position = score_bollinger(entry, bb_upper, bb_middle, bb_lower)
    st_score = 1.0 if st_dir == "UP" else -1.0

    # Trend-aware mean-reversion clamp: don't fade the trend.
    # RSI and Bollinger are both mean-reverting scorers — overbought/upper-band
    # reads as bearish, oversold/lower-band as bullish. In a strong uptrend that
    # logic fights a BUY (price rides the upper band, RSI stays >70), capping BUY
    # confidence far below SELL. When the trend is confirmed by BOTH EMA alignment
    # and SuperTrend, clamp these two scores so they can only agree with the trend
    # or stay neutral — never oppose it. MACD/EMA/SuperTrend (trend scorers) are
    # left untouched.
    rsi_score = score_rsi(rsi)
    trend_up = st_dir == "UP" and ema_score > 0
    trend_down = st_dir == "DOWN" and ema_score < 0
    if trend_up:
        rsi_score = max(rsi_score, 0.0)
        bb_score = max(bb_score, 0.0)
    elif trend_down:
        rsi_score = min(rsi_score, 0.0)
        bb_score = min(bb_score, 0.0)

    # ── 4. Weighted combination ───────────────────────────────────────────────
    total = (
        ema_score * WEIGHTS["ema"]
        + st_score * WEIGHTS["supertrend"]
        + macd_score * WEIGHTS["macd"]
        + rsi_score * WEIGHTS["rsi"]
        + bb_score * WEIGHTS["bollinger"]
    )

    # ── 5. Decision + confidence ───────────────────────────────────────────────
    if total > BUY_THRESHOLD:
        signal_type = "BUY"
    elif total < SELL_THRESHOLD:
        signal_type = "SELL"
    else:
        signal_type = "NEUTRAL"

    confidence = min(abs(total) * 100.0, CONFIDENCE_CAP)

    # ── 6. ATR-based exits ─────────────────────────────────────────────────────
    stop_loss: float | None = None
    target: float | None = None
    if signal_type == "BUY":
        stop_loss = round(entry - ATR_STOP_MULT * atr, 2)
        target = round(entry + ATR_TARGET_MULT * atr, 2)
    elif signal_type == "SELL":
        stop_loss = round(entry + ATR_STOP_MULT * atr, 2)
        target = round(entry - ATR_TARGET_MULT * atr, 2)

    # ── 7. Reasoning ───────────────────────────────────────────────────────────
    reasoning = _build_reasoning(
        signal_type=signal_type,
        confidence=confidence,
        adx=adx,
        rsi=rsi,
        macd_line=macd_line,
        macd_signal=macd_signal,
        ema_20=ema_20,
        ema_50=ema_50,
        entry=entry,
        st_dir=st_dir,
        bb_position=bb_position,
        atr=atr,
        stop_loss=stop_loss,
        target=target,
    )

    return SignalResponse(
        symbol=symbol,
        signal_type=signal_type,
        confidence=round(confidence, 2),
        entry_price=round(entry, 2),
        stop_loss=stop_loss,
        target=target,
        reasoning=reasoning,
        indicators=IndicatorSnapshot(
            rsi=round(rsi, 2),
            macd=round(macd_line, 4),
            macd_signal=round(macd_signal, 4),
            macd_hist=round(macd_hist, 4),
            ema_20=round(ema_20, 2),
            ema_50=round(ema_50, 2),
            adx=round(adx, 2),
            bb_position=bb_position,
            supertrend=st_dir,
        ),
    )


def _build_reasoning(
    *,
    signal_type: str,
    confidence: float,
    adx: float,
    rsi: float,
    macd_line: float,
    macd_signal: float,
    ema_20: float,
    ema_50: float,
    entry: float,
    st_dir: str,
    bb_position: str,
    atr: float,
    stop_loss: float | None,
    target: float | None,
) -> str:
    parts: list[str] = []
    parts.append(
        f"{signal_type} signal at {confidence:.0f}% confidence. "
        f"Trend confirmed (ADX {adx:.1f})."
    )

    # EMA alignment
    if entry > ema_20 > ema_50:
        parts.append(
            f"Price {entry:.2f} above EMA-20 ({ema_20:.2f}) and EMA-50 "
            f"({ema_50:.2f}) — bullish alignment."
        )
    elif entry < ema_20 < ema_50:
        parts.append(
            f"Price {entry:.2f} below EMA-20 ({ema_20:.2f}) and EMA-50 "
            f"({ema_50:.2f}) — bearish alignment."
        )
    else:
        parts.append(
            f"Price {entry:.2f} vs EMA-20 {ema_20:.2f} / EMA-50 {ema_50:.2f} "
            f"— mixed EMA structure."
        )

    # SuperTrend
    parts.append(f"SuperTrend {st_dir}.")

    # MACD
    if macd_line > macd_signal:
        parts.append(
            f"MACD bullish (line {macd_line:.3f} above signal {macd_signal:.3f})."
        )
    else:
        parts.append(
            f"MACD bearish (line {macd_line:.3f} below signal {macd_signal:.3f})."
        )

    # RSI — Indian-market framing
    if 40.0 <= rsi <= 50.0:
        parts.append(f"RSI {rsi:.1f} in the 40–50 bullish zone for uptrends.")
    elif rsi > 70.0:
        parts.append(f"RSI {rsi:.1f} overbought.")
    elif rsi < 30.0:
        parts.append(f"RSI {rsi:.1f} oversold / weak momentum.")
    else:
        parts.append(f"RSI {rsi:.1f}.")

    # Bollinger
    parts.append(f"Price in {bb_position.lower()} Bollinger region.")

    # Exits
    if signal_type in ("BUY", "SELL") and stop_loss is not None and target is not None:
        parts.append(
            f"Entry {entry:.2f}, stop-loss {stop_loss:.2f} ({ATR_STOP_MULT:.0f}×ATR "
            f"{atr:.2f}), target {target:.2f} ({ATR_TARGET_MULT:.0f}×ATR) — "
            f"1.5:1 reward:risk."
        )
    else:
        parts.append(
            "Weighted score inside the neutral band (-0.4 to +0.4); "
            "no trade taken."
        )

    return " ".join(parts)

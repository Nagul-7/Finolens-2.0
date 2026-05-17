"""
Unit tests for all indicator functions.
Each test uses synthetic data with known properties so expected values
can be derived analytically, not just asserted against magic numbers.
"""
import numpy as np
import pytest

from app.indicators.atr import calculate_atr
from app.indicators.rsi import calculate_rsi, score_rsi
from app.indicators.macd import calculate_macd, score_macd
from app.indicators.ema import calculate_ema, score_ema
from app.indicators.adx import calculate_adx
from app.indicators.bollinger import calculate_bollinger, score_bollinger
from app.indicators.supertrend import calculate_supertrend


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def trending_up(n: int = 200, start: float = 100.0, step: float = 0.5) -> np.ndarray:
    """Strictly rising closes."""
    return np.array([start + i * step for i in range(n)], dtype=float)


def trending_down(n: int = 200, start: float = 200.0, step: float = 0.5) -> np.ndarray:
    """Strictly falling closes."""
    return np.array([start - i * step for i in range(n)], dtype=float)


def flat(n: int = 200, value: float = 100.0) -> np.ndarray:
    """Constant price."""
    return np.full(n, value, dtype=float)


def ohlcv(closes: np.ndarray, spread: float = 1.0):
    """Generate synthetic OHLCV from closes. highs = close + spread, lows = close - spread."""
    highs = closes + spread
    lows = closes - spread
    return highs, lows, closes


# ─── ATR ──────────────────────────────────────────────────────────────────────

class TestATR:
    def test_flat_price_atr_equals_spread(self):
        closes = flat()
        highs, lows, _ = ohlcv(closes, spread=2.0)
        result = calculate_atr(highs, lows, closes, period=14)
        # TR for flat price with constant spread = 2*spread each bar
        assert pytest.approx(result, rel=0.01) == 4.0

    def test_atr_positive(self):
        closes = trending_up()
        highs, lows, _ = ohlcv(closes)
        assert calculate_atr(highs, lows, closes) > 0

    def test_atr_rising_trend_larger_than_flat(self):
        # step=2.0, spread=0.5: close-to-close gap (2.0) exceeds high-low (1.0)
        # so TR is driven by the gap, making trending ATR > flat ATR
        up = trending_up(step=2.0)
        fl = flat()
        h_up, l_up, _ = ohlcv(up, spread=0.5)
        h_fl, l_fl, _ = ohlcv(fl, spread=0.5)
        assert calculate_atr(h_up, l_up, up) > calculate_atr(h_fl, l_fl, fl)


# ─── RSI ──────────────────────────────────────────────────────────────────────

class TestRSI:
    def test_all_gains_returns_100(self):
        assert calculate_rsi(trending_up(), period=14) == 100.0

    def test_all_losses_returns_0(self):
        assert calculate_rsi(trending_down(), period=14) == 0.0

    def test_flat_returns_100(self):
        # No losses → avg_loss = 0 → RSI = 100
        assert calculate_rsi(flat(), period=14) == 100.0

    def test_range_0_to_100(self):
        rng = np.random.default_rng(42)
        closes = 100 + np.cumsum(rng.normal(0, 1, 200))
        result = calculate_rsi(closes, period=14)
        assert 0.0 <= result <= 100.0

    def test_insufficient_data_raises(self):
        with pytest.raises(ValueError, match="RSI needs"):
            calculate_rsi(np.array([1.0, 2.0, 3.0]), period=14)

    def test_rising_market_rsi_above_50(self):
        assert calculate_rsi(trending_up(), period=14) > 50.0

    def test_falling_market_rsi_below_50(self):
        assert calculate_rsi(trending_down(), period=14) < 50.0


class TestScoreRSI:
    def test_overbought_negative(self):
        assert score_rsi(75.0) < 0

    def test_indian_uptrend_zone_positive(self):
        # 40-50 is bullish for Indian markets
        assert score_rsi(45.0) > 0

    def test_oversold_negative(self):
        assert score_rsi(25.0) < 0

    def test_score_in_range(self):
        for rsi in [0, 20, 30, 40, 50, 60, 70, 80, 100]:
            s = score_rsi(float(rsi))
            assert -1.0 <= s <= 1.0, f"score_rsi({rsi}) = {s} out of range"


# ─── EMA ──────────────────────────────────────────────────────────────────────

class TestEMA:
    def test_flat_price_ema_equals_price(self):
        closes = flat(value=150.0)
        assert pytest.approx(calculate_ema(closes, 20), rel=1e-6) == 150.0

    def test_rising_ema_below_price(self):
        # EMA lags, so in a rising series it's below current price
        closes = trending_up()
        assert calculate_ema(closes, 20) < closes[-1]

    def test_longer_period_lags_more(self):
        closes = trending_up()
        ema20 = calculate_ema(closes, 20)
        ema50 = calculate_ema(closes, 50)
        # Longer EMA lags more → further below current price
        assert ema50 < ema20


class TestScoreEMA:
    def test_bull_alignment_returns_positive_one(self):
        assert score_ema(price=110, ema_20=105, ema_50=100) == 1.0

    def test_bear_alignment_returns_negative_one(self):
        assert score_ema(price=90, ema_20=95, ema_50=100) == -1.0

    def test_pullback_in_uptrend_positive(self):
        # ema20 > ema50 but price dipped below ema20
        assert score_ema(price=98, ema_20=100, ema_50=95) == 0.3

    def test_price_above_short_but_long_bearish_negative(self):
        assert score_ema(price=102, ema_20=100, ema_50=105) == -0.3


# ─── MACD ─────────────────────────────────────────────────────────────────────

class TestMACD:
    def test_returns_three_floats(self):
        closes = trending_up()
        result = calculate_macd(closes)
        assert len(result) == 3
        assert all(isinstance(v, float) for v in result)

    def test_rising_market_positive_macd(self):
        macd_line, _, _ = calculate_macd(trending_up())
        assert macd_line > 0

    def test_falling_market_negative_macd(self):
        macd_line, _, _ = calculate_macd(trending_down())
        assert macd_line < 0

    def test_flat_market_macd_near_zero(self):
        macd_line, signal_line, hist = calculate_macd(flat())
        assert pytest.approx(macd_line, abs=1e-6) == 0.0
        assert pytest.approx(hist, abs=1e-6) == 0.0

    def test_insufficient_data_raises(self):
        with pytest.raises(ValueError, match="MACD needs"):
            calculate_macd(np.ones(10))


class TestScoreMACD:
    def test_bullish_hist_positive_score(self):
        assert score_macd(macd_line=0.5, signal_line=0.3, histogram=0.2) > 0

    def test_bearish_hist_negative_score(self):
        assert score_macd(macd_line=-0.5, signal_line=-0.3, histogram=-0.2) < 0

    def test_score_in_range(self):
        for ml, sl, h in [(1, 0.5, 0.5), (-1, -0.5, -0.5), (0.1, -0.1, 0.2)]:
            s = score_macd(ml, sl, h)
            assert -1.0 <= s <= 1.0


# ─── ADX ──────────────────────────────────────────────────────────────────────

class TestADX:
    def test_range_0_to_100(self):
        closes = trending_up()
        highs, lows, _ = ohlcv(closes)
        result = calculate_adx(highs, lows, closes, period=14)
        assert 0.0 <= result <= 100.0

    def test_strong_trend_adx_above_20(self):
        # Strongly trending market should produce ADX > 20
        closes = trending_up(n=200, step=1.0)
        highs, lows, _ = ohlcv(closes, spread=0.5)
        result = calculate_adx(highs, lows, closes, period=14)
        assert result > 20.0

    def test_insufficient_data_raises(self):
        with pytest.raises(ValueError, match="ADX needs"):
            closes = np.ones(10)
            highs, lows, _ = ohlcv(closes)
            calculate_adx(highs, lows, closes, period=14)


# ─── Bollinger Bands ──────────────────────────────────────────────────────────

class TestBollinger:
    def test_flat_price_zero_width(self):
        closes = flat()
        upper, middle, lower = calculate_bollinger(closes, period=20)
        # std of constant series = 0, so bands collapse to the price
        assert pytest.approx(upper, abs=1e-6) == middle
        assert pytest.approx(lower, abs=1e-6) == middle

    def test_middle_is_sma(self):
        closes = trending_up(n=100)
        _, middle, _ = calculate_bollinger(closes, period=20)
        assert pytest.approx(middle, rel=1e-6) == closes[-20:].mean()

    def test_upper_above_lower(self):
        rng = np.random.default_rng(7)
        closes = 100 + np.cumsum(rng.normal(0, 1, 100))
        upper, _, lower = calculate_bollinger(closes)
        assert upper >= lower

    def test_insufficient_data_raises(self):
        with pytest.raises(ValueError, match="Bollinger needs"):
            calculate_bollinger(np.ones(5), period=20)


class TestScoreBollinger:
    def test_price_at_upper_returns_negative_one(self):
        score, label = score_bollinger(price=110, upper=110, middle=100, lower=90)
        assert score == -1.0
        assert label == "UPPER"

    def test_price_at_lower_returns_positive_one(self):
        score, label = score_bollinger(price=90, upper=110, middle=100, lower=90)
        assert score == 1.0
        assert label == "LOWER"

    def test_price_at_middle_near_zero(self):
        score, label = score_bollinger(price=100, upper=110, middle=100, lower=90)
        assert pytest.approx(score, abs=1e-6) == 0.0
        assert label == "MIDDLE"

    def test_score_in_range(self):
        for price in [85, 90, 95, 100, 105, 110, 115]:
            score, _ = score_bollinger(float(price), upper=110, middle=100, lower=90)
            assert -1.0 <= score <= 1.0

    def test_label_above_middle_is_upper(self):
        _, label = score_bollinger(price=105, upper=110, middle=100, lower=90)
        assert label == "UPPER"

    def test_label_below_middle_is_lower(self):
        _, label = score_bollinger(price=95, upper=110, middle=100, lower=90)
        assert label == "LOWER"


# ─── SuperTrend ───────────────────────────────────────────────────────────────

class TestSuperTrend:
    def test_returns_up_or_down(self):
        closes = trending_up()
        highs, lows, _ = ohlcv(closes)
        result = calculate_supertrend(highs, lows, closes)
        assert result in ("UP", "DOWN")

    def test_strong_uptrend_returns_up(self):
        closes = trending_up(n=200, step=1.0)
        highs, lows, _ = ohlcv(closes, spread=0.3)
        assert calculate_supertrend(highs, lows, closes) == "UP"

    def test_strong_downtrend_returns_down(self):
        closes = trending_down(n=200, step=1.0)
        highs, lows, _ = ohlcv(closes, spread=0.3)
        assert calculate_supertrend(highs, lows, closes) == "DOWN"

    def test_insufficient_data_raises(self):
        with pytest.raises(ValueError, match="SuperTrend needs"):
            closes = np.ones(5)
            highs, lows, _ = ohlcv(closes)
            calculate_supertrend(highs, lows, closes, period=10)

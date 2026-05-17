import numpy as np


def calculate_rsi(closes: np.ndarray, period: int = 14) -> float:
    """Returns the most recent RSI value (0–100) using Wilder's smoothing."""
    if len(closes) < period + 1:
        raise ValueError(f"RSI needs at least {period + 1} closes, got {len(closes)}")

    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    avg_gain = gains[:period].mean()
    avg_loss = losses[:period].mean()

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0.0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100.0 - (100.0 / (1.0 + rs)))


def score_rsi(rsi: float) -> float:
    """
    Returns a score in [-1, +1].

    Indian market adjustment: RSI 40–50 is bullish during an uptrend
    (price rarely dips below 40 in a sustained bull run on NSE).

    >70   -0.8   overbought
    60-70  0.0 → -0.8  fading momentum
    50-60  0.3 → 0.0   neutral to mildly bullish
    40-50 +0.3          bullish zone for Indian uptrends
    30-40 -0.3 → -0.5  weakening
    <30   -0.8          strong bearish momentum (not a contrarian buy here)
    """
    if rsi >= 70:
        return -0.8
    if rsi >= 60:
        return -0.8 * (rsi - 60) / 10.0
    if rsi >= 50:
        return 0.3 * (60.0 - rsi) / 10.0
    if rsi >= 40:
        return 0.3
    if rsi >= 30:
        return -0.3 - 0.2 * (40.0 - rsi) / 10.0
    return -0.8

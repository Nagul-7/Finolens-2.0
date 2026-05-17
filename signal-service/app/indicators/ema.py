import numpy as np


def _ema_series(closes: np.ndarray, period: int) -> np.ndarray:
    """Standard EMA series. alpha = 2 / (period + 1)."""
    alpha = 2.0 / (period + 1)
    out = np.empty(len(closes))
    out[0] = closes[0]
    for i in range(1, len(closes)):
        out[i] = alpha * closes[i] + (1.0 - alpha) * out[i - 1]
    return out


def calculate_ema(closes: np.ndarray, period: int) -> float:
    """Returns the most recent EMA value."""
    return float(_ema_series(closes, period)[-1])


def score_ema(price: float, ema_20: float, ema_50: float) -> float:
    """
    Returns a score in [-1, +1] based on price vs EMA alignment.

    +1.0  price > ema20 > ema50   — full bull alignment
    +0.3  ema20 > ema50, price < ema20 — bull structure, pullback
    -0.3  price > ema20, ema20 < ema50 — price above short MA but long MA bearish
    -1.0  price < ema20 < ema50   — full bear alignment
    """
    price_above_20 = price > ema_20
    ema20_above_50 = ema_20 > ema_50

    if price_above_20 and ema20_above_50:
        return 1.0
    if ema20_above_50 and not price_above_20:
        return 0.3
    if price_above_20 and not ema20_above_50:
        return -0.3
    return -1.0

import numpy as np
from .ema import _ema_series


def calculate_macd(
    closes: np.ndarray,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[float, float, float]:
    """Returns (macd_line, signal_line, histogram) — most recent values."""
    if len(closes) < slow + signal:
        raise ValueError(
            f"MACD needs at least {slow + signal} closes, got {len(closes)}"
        )
    macd_line = _ema_series(closes, fast) - _ema_series(closes, slow)
    signal_line = _ema_series(macd_line, signal)
    histogram = macd_line - signal_line
    return float(macd_line[-1]), float(signal_line[-1]), float(histogram[-1])


def score_macd(macd_line: float, signal_line: float, histogram: float) -> float:
    """
    Returns a score in [-1, +1].

    Uses sign of histogram for direction, magnitude of crossover for strength.
    Histogram growing in positive territory → approaching +1.
    Histogram shrinking or negative → approaching -1.
    """
    if histogram > 0 and macd_line > signal_line:
        # Bullish — scale by how far above zero macd_line is (capped)
        strength = min(abs(macd_line) / max(abs(signal_line), 1e-9), 1.0)
        return min(0.3 + 0.7 * strength, 1.0)
    if histogram < 0 and macd_line < signal_line:
        strength = min(abs(macd_line) / max(abs(signal_line), 1e-9), 1.0)
        return max(-0.3 - 0.7 * strength, -1.0)
    # Crossover zone — histogram and line disagree (transitional)
    return 0.1 if histogram > 0 else -0.1

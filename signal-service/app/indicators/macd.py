import numpy as np


def calculate_macd(
    closes: np.ndarray,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[float, float, float]:
    """Returns (macd_line, signal_line, histogram) — most recent values."""
    raise NotImplementedError("MACD — implemented in Section 4")


def score_macd(macd_line: float, signal_line: float, histogram: float) -> float:
    """Returns a score in [-1, +1]."""
    raise NotImplementedError("MACD scorer — implemented in Section 4")

import numpy as np


def calculate_rsi(closes: np.ndarray, period: int = 14) -> float:
    """Returns the most recent RSI value (0–100)."""
    raise NotImplementedError("RSI — implemented in Section 4")


def score_rsi(rsi: float) -> float:
    """Returns a score in [-1, +1]. Indian markets: 40–50 is bullish in an uptrend."""
    raise NotImplementedError("RSI scorer — implemented in Section 4")

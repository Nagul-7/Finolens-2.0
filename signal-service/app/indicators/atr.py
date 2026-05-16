import numpy as np


def calculate_atr(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    period: int = 14,
) -> float:
    """Returns the most recent ATR value. Used for stop-loss and target sizing."""
    raise NotImplementedError("ATR — implemented in Section 4")

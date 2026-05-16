import numpy as np


def calculate_adx(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    period: int = 14,
) -> float:
    """Returns the most recent ADX value (0–100). ADX < 20 = choppy market."""
    raise NotImplementedError("ADX — implemented in Section 4")

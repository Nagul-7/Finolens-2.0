import numpy as np
from typing import Literal


def calculate_supertrend(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    period: int = 10,
    multiplier: float = 3.0,
) -> Literal["UP", "DOWN"]:
    """Returns the current SuperTrend direction."""
    raise NotImplementedError("SuperTrend — implemented in Section 4")

import numpy as np
from typing import Literal


def calculate_bollinger(
    closes: np.ndarray,
    period: int = 20,
    std_dev: float = 2.0,
) -> tuple[float, float, float]:
    """Returns (upper, middle, lower) band values — most recent."""
    raise NotImplementedError("Bollinger Bands — implemented in Section 4")


def score_bollinger(
    price: float,
    upper: float,
    middle: float,
    lower: float,
) -> tuple[float, Literal["UPPER", "MIDDLE", "LOWER"]]:
    """Returns (score in [-1, +1], band position label)."""
    raise NotImplementedError("Bollinger scorer — implemented in Section 4")

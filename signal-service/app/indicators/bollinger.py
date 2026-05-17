import numpy as np
from typing import Literal


def calculate_bollinger(
    closes: np.ndarray,
    period: int = 20,
    std_dev: float = 2.0,
) -> tuple[float, float, float]:
    """Returns (upper, middle, lower) band values — most recent."""
    if len(closes) < period:
        raise ValueError(
            f"Bollinger needs at least {period} closes, got {len(closes)}"
        )
    window = closes[-period:]
    middle = float(window.mean())
    sigma = float(window.std(ddof=1))
    return middle + std_dev * sigma, middle, middle - std_dev * sigma


def score_bollinger(
    price: float,
    upper: float,
    middle: float,
    lower: float,
) -> tuple[float, Literal["UPPER", "MIDDLE", "LOWER"]]:
    """
    Returns (score in [-1, +1], band position label).

    Price at or above upper band → overbought (-1).
    Price at or below lower band → oversold (+1).
    Linear interpolation between bands.
    """
    band_width = upper - lower
    if band_width == 0.0:
        return 0.0, "MIDDLE"

    if price >= upper:
        return -1.0, "UPPER"
    if price <= lower:
        return 1.0, "LOWER"

    # Normalise price position: 0 = lower, 0.5 = middle, 1 = upper
    position = (price - lower) / band_width
    # Map [0, 1] → [+1, -1]
    score = 1.0 - 2.0 * position

    label: Literal["UPPER", "MIDDLE", "LOWER"] = (
        "UPPER" if price > middle else "LOWER" if price < middle else "MIDDLE"
    )
    return float(score), label

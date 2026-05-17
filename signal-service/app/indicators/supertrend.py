import numpy as np
from typing import Literal
from .atr import _atr_series


def calculate_supertrend(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    period: int = 10,
    multiplier: float = 3.0,
) -> Literal["UP", "DOWN"]:
    """Returns the current SuperTrend direction."""
    if len(closes) < period + 1:
        raise ValueError(
            f"SuperTrend needs at least {period + 1} candles, got {len(closes)}"
        )

    n = len(closes)
    atr = _atr_series(highs, lows, closes, period)
    hl2 = (highs + lows) / 2.0

    basic_upper = hl2 + multiplier * atr
    basic_lower = hl2 - multiplier * atr

    final_upper = basic_upper.copy()
    final_lower = basic_lower.copy()

    # 1 = UP, -1 = DOWN
    direction = np.ones(n, dtype=int)

    start = period  # first valid ATR index

    for i in range(start + 1, n):
        # Upper band can only tighten (decrease) unless price broke above it
        if basic_upper[i] < final_upper[i - 1] or closes[i - 1] > final_upper[i - 1]:
            final_upper[i] = basic_upper[i]
        else:
            final_upper[i] = final_upper[i - 1]

        # Lower band can only tighten (increase) unless price broke below it
        if basic_lower[i] > final_lower[i - 1] or closes[i - 1] < final_lower[i - 1]:
            final_lower[i] = basic_lower[i]
        else:
            final_lower[i] = final_lower[i - 1]

        if direction[i - 1] == 1:
            direction[i] = 1 if closes[i] >= final_lower[i] else -1
        else:
            direction[i] = -1 if closes[i] <= final_upper[i] else 1

    return "UP" if direction[-1] == 1 else "DOWN"

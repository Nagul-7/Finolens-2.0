import numpy as np


def calculate_ema(closes: np.ndarray, period: int) -> float:
    """Returns the most recent EMA value."""
    raise NotImplementedError("EMA — implemented in Section 4")


def score_ema(price: float, ema_20: float, ema_50: float) -> float:
    """Returns a score in [-1, +1] based on price vs EMA alignment."""
    raise NotImplementedError("EMA scorer — implemented in Section 4")

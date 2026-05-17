import numpy as np


def calculate_adx(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    period: int = 14,
) -> float:
    """
    Returns the most recent ADX value (0–100) using Wilder's smoothing.
    ADX < 20 = choppy/ranging market. ADX > 25 = trending.
    """
    if len(closes) < 2 * period + 1:
        raise ValueError(
            f"ADX needs at least {2 * period + 1} candles, got {len(closes)}"
        )

    # True range
    tr = np.maximum(
        highs[1:] - lows[1:],
        np.maximum(
            np.abs(highs[1:] - closes[:-1]),
            np.abs(lows[1:] - closes[:-1]),
        ),
    )

    # Directional movement
    up_move = highs[1:] - highs[:-1]
    down_move = lows[:-1] - lows[1:]
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    # Wilder's initial sums
    smooth_tr = tr[:period].sum()
    smooth_plus = plus_dm[:period].sum()
    smooth_minus = minus_dm[:period].sum()

    dx_values: list[float] = []

    for i in range(period, len(tr)):
        smooth_tr = smooth_tr - smooth_tr / period + tr[i]
        smooth_plus = smooth_plus - smooth_plus / period + plus_dm[i]
        smooth_minus = smooth_minus - smooth_minus / period + minus_dm[i]

        if smooth_tr == 0.0:
            dx_values.append(0.0)
            continue

        plus_di = 100.0 * smooth_plus / smooth_tr
        minus_di = 100.0 * smooth_minus / smooth_tr
        di_sum = plus_di + minus_di
        dx = 100.0 * abs(plus_di - minus_di) / di_sum if di_sum != 0.0 else 0.0
        dx_values.append(dx)

    # ADX = Wilder's smooth of DX series
    dx_arr = np.array(dx_values)
    adx = dx_arr[:period].mean()
    for dx in dx_arr[period:]:
        adx = (adx * (period - 1) + dx) / period

    return float(adx)

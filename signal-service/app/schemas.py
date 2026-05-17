import logging
from datetime import date
from typing import Generic, Literal, Optional, TypeVar
from pydantic import BaseModel, Field, field_validator

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None


class ServiceStatus(BaseModel):
    status: Literal["ok", "down"]
    uptime: float
    timestamp: str
    version: str = "2.0.0"


class OHLCVCandle(BaseModel):
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: float


_log = logging.getLogger(__name__)


class SignalRequest(BaseModel):
    """
    Input to the signal engine.

    Minimum 60 candles required (hard limit). 200+ recommended —
    EMA-50 needs ~150 candles to stabilise, RSI and MACD need ~26.
    Fewer than 200 candles will produce less reliable signals.
    """

    symbol: str
    candles: list[OHLCVCandle] = Field(min_length=60)

    @field_validator("candles")
    @classmethod
    def warn_if_low_candle_count(cls, v: list[OHLCVCandle]) -> list[OHLCVCandle]:
        if len(v) < 200:
            _log.warning(
                "SignalRequest for received only %d candles — "
                "200+ recommended for stable indicators (EMA-50 needs ~150)",
                len(v),
            )
        return v


class IndicatorSnapshot(BaseModel):
    rsi: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    ema_20: Optional[float] = None
    ema_50: Optional[float] = None
    adx: Optional[float] = None
    bb_position: Optional[Literal["UPPER", "MIDDLE", "LOWER"]] = None
    supertrend: Optional[Literal["UP", "DOWN"]] = None


class SignalResponse(BaseModel):
    symbol: str
    signal_type: Literal["BUY", "SELL", "NEUTRAL"]
    confidence: float
    entry_price: float
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    reasoning: str
    indicators: IndicatorSnapshot

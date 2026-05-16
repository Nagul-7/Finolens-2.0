from typing import Any, Generic, Literal, Optional, TypeVar
from pydantic import BaseModel

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
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class SignalRequest(BaseModel):
    symbol: str
    candles: list[OHLCVCandle]


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

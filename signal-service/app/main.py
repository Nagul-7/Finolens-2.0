import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .schemas import ApiResponse, ServiceStatus, SignalRequest, SignalResponse

START_TIME = time.monotonic()

app = FastAPI(title="FinoLens Signal Service", version="2.0.0", docs_url="/docs")


# ─── Exception handlers — consistent { success, error } shape ────────────────
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_req: Request, exc: RequestValidationError) -> JSONResponse:
    summary = "; ".join(
        f"{' -> '.join(str(p) for p in e['loc'])}: {e['msg']}"
        for e in exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content=ApiResponse[None](success=False, error=summary).model_dump(),
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ApiResponse[None](success=False, error=str(exc.detail)).model_dump(),
    )


@app.exception_handler(NotImplementedError)
async def not_implemented_handler(_req: Request, exc: NotImplementedError) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content=ApiResponse[None](success=False, error=str(exc)).model_dump(),
    )


@app.exception_handler(Exception)
async def global_exception_handler(_req: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=ApiResponse[None](success=False, error="Internal server error").model_dump(),
    )


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health", response_model=ApiResponse[ServiceStatus])
async def health() -> ApiResponse[ServiceStatus]:
    return ApiResponse(
        success=True,
        data=ServiceStatus(
            status="ok",
            uptime=round(time.monotonic() - START_TIME, 1),
            timestamp=datetime.now(timezone.utc).isoformat(),
        ),
    )


# ─── Signal endpoint ─────────────────────────────────────────────────────────
@app.post("/signal", response_model=ApiResponse[SignalResponse])
async def signal(request: SignalRequest) -> ApiResponse[SignalResponse]:
    from .engine import generate_signal  # local import keeps startup fast

    result = generate_signal(request)
    return ApiResponse(success=True, data=result)


# ─── Real NSE data (yfinance, cached) ────────────────────────────────────────
@app.get("/data/candles")
async def data_candles(symbol: str, days: int = 400) -> ApiResponse[list[dict]]:
    """Daily OHLCV for a yfinance ticker (e.g. RELIANCE.NS, ^NSEI)."""
    from .data_source import get_candles

    try:
        candles = get_candles(symbol, days=days)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return ApiResponse(success=True, data=candles)


@app.get("/data/ltp")
async def data_ltp(symbols: str) -> ApiResponse[dict]:
    """Last price per ticker. `symbols` is comma-separated. Missing -> null."""
    from .data_source import get_ltp

    tickers = [s.strip() for s in symbols.split(",") if s.strip()]
    quotes = {t: get_ltp(t) for t in tickers}
    return ApiResponse(success=True, data=quotes)

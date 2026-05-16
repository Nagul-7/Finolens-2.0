import time
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .schemas import ApiResponse, ServiceStatus, SignalRequest, SignalResponse

START_TIME = time.monotonic()

app = FastAPI(title="FinoLens Signal Service", version="2.0.0", docs_url="/docs")


# ─── Exception handler — consistent { success, error } shape ─────────────────
@app.exception_handler(Exception)
async def global_exception_handler(_req: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=ApiResponse[None](success=False, error=str(exc)).model_dump(),
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


# ─── Signal endpoint (wired up in Section 5) ─────────────────────────────────
@app.post("/signal", response_model=ApiResponse[SignalResponse])
async def signal(request: SignalRequest) -> ApiResponse[SignalResponse]:
    from .engine import generate_signal  # local import keeps startup fast

    result = generate_signal(request)
    return ApiResponse(success=True, data=result)

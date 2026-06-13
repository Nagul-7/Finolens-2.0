"""
Real NSE daily data via yfinance, with a daily disk cache.

Caching strategy: one JSON file per ticker under .cache/. A file is "fresh" if
it was fetched within CACHE_TTL_HOURS (intended: refresh once per day after
market close). On a yfinance failure we fall back to the last cached data even
if stale, so a transient outage or rate-limit doesn't take the app down. If
there is no cache and the fetch fails, we raise so the caller can surface a
clear error.
"""
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf

_log = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".cache")
CACHE_TTL_HOURS = 12
FETCH_PERIOD = "1y"  # ~250 trading days, enough for 200-candle signals

os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_path(ticker: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", ticker)
    return os.path.join(CACHE_DIR, f"{safe}.json")


def _load_cache(ticker: str) -> Optional[dict]:
    path = _cache_path(ticker)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _save_cache(ticker: str, candles: list[dict]) -> None:
    payload = {"fetched_at": datetime.now(timezone.utc).isoformat(), "candles": candles}
    try:
        with open(_cache_path(ticker), "w") as f:
            json.dump(payload, f)
    except OSError as e:
        _log.warning("Could not write cache for %s: %s", ticker, e)


def _is_fresh(cache: dict) -> bool:
    try:
        fetched = datetime.fromisoformat(cache["fetched_at"])
    except (KeyError, ValueError):
        return False
    age_hours = (datetime.now(timezone.utc) - fetched).total_seconds() / 3600
    return age_hours < CACHE_TTL_HOURS


def _fetch_yfinance(ticker: str) -> list[dict]:
    df = yf.Ticker(ticker).history(period=FETCH_PERIOD, interval="1d", auto_adjust=True)
    if df is None or df.empty:
        raise RuntimeError(f"yfinance returned no data for {ticker}")
    candles: list[dict] = []
    for idx, row in df.iterrows():
        candles.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
            }
        )
    return candles


def get_candles(ticker: str, days: int = 400) -> list[dict]:
    """Daily candles for a ticker (newest last), served from cache when fresh."""
    cache = _load_cache(ticker)
    if cache and _is_fresh(cache):
        return cache["candles"][-days:]

    try:
        candles = _fetch_yfinance(ticker)
        _save_cache(ticker, candles)
        return candles[-days:]
    except Exception as e:  # noqa: BLE001 — any yfinance/network error
        if cache and cache.get("candles"):
            _log.warning("yfinance failed for %s (%s); serving stale cache", ticker, e)
            return cache["candles"][-days:]
        raise RuntimeError(f"No data for {ticker}: {e}") from e


def get_ltp(ticker: str) -> Optional[float]:
    """Most recent daily close as the last price; None if unavailable."""
    try:
        candles = get_candles(ticker, days=2)
    except RuntimeError:
        return None
    return candles[-1]["close"] if candles else None

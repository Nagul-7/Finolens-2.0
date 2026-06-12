import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/index';
import { getBroker } from '../services/kiteClient';

const router = Router();

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// GET /api/stocks/:symbol/candles?days=260 — OHLCV for charts
router.get(
  '/:symbol/candles',
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase();
    const days = Math.min(parseInt(String(req.query.days ?? '260'), 10) || 260, 500);
    const { rows } = await pool.query<{ instrument_token: string | null }>(
      'SELECT instrument_token FROM stocks WHERE symbol = $1 AND is_active = true',
      [symbol],
    );
    if (rows.length === 0) {
      throw new AppError(404, `Stock not found: ${symbol}`);
    }
    if (rows[0].instrument_token === null) {
      throw new AppError(409, `No instrument_token for ${symbol}`);
    }
    const candles = await getBroker().getHistoricalData(
      Number(rows[0].instrument_token),
      isoDaysAgo(days),
      isoDaysAgo(0),
      'day',
    );
    const body: ApiResponse = { success: true, data: candles };
    res.json(body);
  }),
);

// GET /api/stocks?search=<q>  — list active stocks, optional symbol/name filter
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const params: unknown[] = [];
    let where = 'WHERE is_active = true';
    if (search) {
      params.push(`%${search.toUpperCase()}%`);
      where += ` AND (UPPER(symbol) LIKE $1 OR UPPER(name) LIKE $1)`;
    }
    const { rows } = await pool.query(
      `SELECT id, symbol, name, sector, instrument_token
       FROM stocks ${where}
       ORDER BY symbol LIMIT 50`,
      params,
    );
    const body: ApiResponse = { success: true, data: rows };
    res.json(body);
  }),
);

// GET /api/stocks/:symbol
router.get(
  '/:symbol',
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase();
    const { rows } = await pool.query(
      `SELECT id, symbol, name, sector, exchange, instrument_token, is_active
       FROM stocks WHERE symbol = $1`,
      [symbol],
    );
    if (rows.length === 0) {
      throw new AppError(404, `Stock not found: ${symbol}`);
    }
    const body: ApiResponse = { success: true, data: rows[0] };
    res.json(body);
  }),
);

export default router;

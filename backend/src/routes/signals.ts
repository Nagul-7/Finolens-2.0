import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/index';
import { generateSignalForSymbol } from '../services/signalService';

const router = Router();

// GET /api/signals?limit=10&symbol=TCS — recent signals with outcome status
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.toUpperCase() : null;
    const params: unknown[] = [limit];
    let where = '';
    if (symbol) {
      params.push(symbol);
      where = 'WHERE s.symbol = $2';
    }
    const { rows } = await pool.query(
      `SELECT sig.id, sig.signal_type, sig.confidence, sig.entry_price,
              sig.suggested_stop_loss, sig.suggested_target, sig.reasoning,
              sig.generated_at, s.symbol, s.name,
              so.outcome, so.evaluated_at
       FROM signals sig
       JOIN stocks s ON s.id = sig.stock_id
       LEFT JOIN signal_outcomes so ON so.signal_id = sig.id
       ${where}
       ORDER BY sig.generated_at DESC
       LIMIT $1`,
      params,
    );
    const body: ApiResponse = { success: true, data: rows };
    res.json(body);
  }),
);

// POST /api/signals/generate  { symbol } — run the engine, store signal + outcome
router.post(
  '/generate',
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = typeof req.body.symbol === 'string' ? req.body.symbol.toUpperCase() : '';
    if (!symbol) {
      throw new AppError(400, 'symbol is required');
    }
    const signal = await generateSignalForSymbol(symbol);
    const body: ApiResponse = { success: true, data: signal };
    res.status(201).json(body);
  }),
);

// GET /api/signals/:id — single signal with full indicators + outcome
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new AppError(400, 'id must be a number');
    }
    const { rows } = await pool.query(
      `SELECT sig.*, s.symbol, s.name,
              so.outcome, so.price_after_1d, so.price_after_3d,
              so.price_after_5d, so.price_after_10d,
              so.max_profit_pct, so.max_loss_pct, so.evaluated_at
       FROM signals sig
       JOIN stocks s ON s.id = sig.stock_id
       LEFT JOIN signal_outcomes so ON so.signal_id = sig.id
       WHERE sig.id = $1`,
      [id],
    );
    if (rows.length === 0) {
      throw new AppError(404, `Signal not found: ${id}`);
    }
    const body: ApiResponse = { success: true, data: rows[0] };
    res.json(body);
  }),
);

export default router;

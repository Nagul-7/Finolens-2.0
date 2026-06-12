import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/index';
import { getQuotes } from '../services/quoteService';

const router = Router();

interface WatchRow {
  id: number;
  stock_id: number;
  notes: string | null;
  added_at: Date;
  symbol: string;
  name: string | null;
  sector: string | null;
  latest_signal: string | null;
  latest_confidence: string | null;
  latest_signal_at: Date | null;
}

// GET /api/watchlist — watchlist with latest signal + live quote + sparkline
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query<WatchRow>(
      `SELECT w.id, w.stock_id, w.notes, w.added_at,
              s.symbol, s.name, s.sector,
              ls.signal_type AS latest_signal,
              ls.confidence  AS latest_confidence,
              ls.generated_at AS latest_signal_at
       FROM watchlist w
       JOIN stocks s ON s.id = w.stock_id
       LEFT JOIN LATERAL (
         SELECT signal_type, confidence, generated_at
         FROM signals
         WHERE stock_id = w.stock_id
         ORDER BY generated_at DESC
         LIMIT 1
       ) ls ON true
       ORDER BY w.added_at DESC`,
    );

    const quotes = await getQuotes(rows.map((r) => r.symbol));
    const data = rows.map((r) => ({
      ...r,
      quote: quotes[r.symbol] ?? null,
    }));

    const body: ApiResponse = { success: true, data };
    res.json(body);
  }),
);

// POST /api/watchlist  { symbol, notes? } — add a stock to the watchlist
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = typeof req.body.symbol === 'string' ? req.body.symbol.toUpperCase() : '';
    const notes = typeof req.body.notes === 'string' ? req.body.notes : null;
    if (!symbol) {
      throw new AppError(400, 'symbol is required');
    }
    const stock = await pool.query<{ id: number }>(
      'SELECT id FROM stocks WHERE symbol = $1 AND is_active = true',
      [symbol],
    );
    if (stock.rows.length === 0) {
      throw new AppError(404, `Unknown or inactive symbol: ${symbol}`);
    }
    const stockId = stock.rows[0].id;
    const { rows } = await pool.query(
      `INSERT INTO watchlist (stock_id, notes) VALUES ($1, $2)
       ON CONFLICT (stock_id) DO UPDATE SET notes = EXCLUDED.notes
       RETURNING id, stock_id, notes, added_at`,
      [stockId, notes],
    );
    const body: ApiResponse = { success: true, data: rows[0] };
    res.status(201).json(body);
  }),
);

// DELETE /api/watchlist/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new AppError(400, 'id must be a number');
    }
    const { rowCount } = await pool.query('DELETE FROM watchlist WHERE id = $1', [id]);
    if (rowCount === 0) {
      throw new AppError(404, `Watchlist entry not found: ${id}`);
    }
    const body: ApiResponse = { success: true, data: { id } };
    res.json(body);
  }),
);

export default router;

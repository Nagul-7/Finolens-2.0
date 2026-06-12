import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../middleware/asyncHandler';
import { ApiResponse } from '../types/index';
import { evaluateOpenOutcomes } from '../services/outcomeTracker';

const router = Router();

// POST /api/outcomes/evaluate — scan OPEN outcomes and update them
router.post(
  '/evaluate',
  asyncHandler(async (_req: Request, res: Response) => {
    const summary = await evaluateOpenOutcomes();
    const body: ApiResponse = { success: true, data: summary };
    res.json(body);
  }),
);

// GET /api/outcomes/stats — win rate and counts over the last N days
router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const days = Math.min(parseInt(String(req.query.days ?? '30'), 10) || 30, 365);
    const { rows } = await pool.query<{
      outcome: string | null;
      count: string;
    }>(
      `SELECT so.outcome, COUNT(*)::text AS count
       FROM signal_outcomes so
       JOIN signals sig ON sig.id = so.signal_id
       WHERE sig.generated_at >= NOW() - ($1 || ' days')::interval
       GROUP BY so.outcome`,
      [days],
    );

    const counts: Record<string, number> = { WIN: 0, LOSS: 0, BREAKEVEN: 0, OPEN: 0 };
    for (const r of rows) {
      if (r.outcome) counts[r.outcome] = parseInt(r.count, 10);
    }
    // Win rate is over actual trades only (WIN + LOSS). NEUTRAL settles to
    // BREAKEVEN (no position) and must not dilute the rate.
    const trades = counts.WIN + counts.LOSS;
    const winRate = trades > 0 ? Math.round((counts.WIN / trades) * 1000) / 10 : null;

    const body: ApiResponse = {
      success: true,
      data: {
        days,
        counts,
        trades,
        breakeven: counts.BREAKEVEN,
        open: counts.OPEN,
        win_rate_pct: winRate,
      },
    };
    res.json(body);
  }),
);

// GET /api/outcomes — recent outcome records joined to their signal
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const { rows } = await pool.query(
      `SELECT so.*, s.symbol, sig.signal_type, sig.confidence, sig.generated_at
       FROM signal_outcomes so
       JOIN signals sig ON sig.id = so.signal_id
       JOIN stocks s ON s.id = sig.stock_id
       ORDER BY sig.generated_at DESC
       LIMIT $1`,
      [limit],
    );
    const body: ApiResponse = { success: true, data: rows };
    res.json(body);
  }),
);

export default router;

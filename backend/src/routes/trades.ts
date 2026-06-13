import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/index';
import {
  createPaperTrade,
  getTrades,
  closeTrade,
  evaluatePaperTrades,
  getTradeStats,
} from '../services/tradeService';

const router = Router();

// POST /api/trades  { signalId, quantity? } — open a paper trade from a signal
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const signalId = Number(req.body.signalId);
    if (!Number.isInteger(signalId)) {
      throw new AppError(400, 'signalId (integer) is required');
    }
    const quantity =
      req.body.quantity === undefined ? undefined : Number(req.body.quantity);
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity <= 0)) {
      throw new AppError(400, 'quantity must be a positive integer');
    }
    const trade = await createPaperTrade(signalId, quantity);
    const body: ApiResponse = { success: true, data: trade };
    res.status(201).json(body);
  }),
);

// GET /api/trades?status=open|closed
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const status =
      req.query.status === 'open' || req.query.status === 'closed'
        ? req.query.status
        : undefined;
    const trades = await getTrades(status);
    const body: ApiResponse = { success: true, data: trades };
    res.json(body);
  }),
);

// GET /api/trades/stats
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await getTradeStats();
    const body: ApiResponse = { success: true, data: stats };
    res.json(body);
  }),
);

// POST /api/trades/evaluate — run stop/target/timeout evaluation on OPEN trades
router.post(
  '/evaluate',
  asyncHandler(async (_req: Request, res: Response) => {
    const summary = await evaluatePaperTrades();
    const body: ApiResponse = { success: true, data: summary };
    res.json(body);
  }),
);

// POST /api/trades/:id/close — manual close at current LTP
router.post(
  '/:id/close',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new AppError(400, 'id must be a number');
    }
    const result = await closeTrade(id, 'MANUAL');
    const body: ApiResponse = { success: true, data: result };
    res.json(body);
  }),
);

export default router;

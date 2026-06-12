import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../middleware/asyncHandler';
import { ApiResponse } from '../types/index';

const router = Router();

const MODE = process.env.BROKER_MODE ?? 'paper';
const USER_ID = 'default';

// GET /api/auth/status — is the broker session usable?
router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    if (MODE === 'paper') {
      const body: ApiResponse = {
        success: true,
        data: { mode: 'paper', authenticated: true, message: 'Paper mode — no auth required' },
      };
      res.json(body);
      return;
    }
    // Live: a session is valid only if it exists and hasn't expired.
    const { rows } = await pool.query<{ expires_at: Date }>(
      'SELECT expires_at FROM kite_sessions WHERE user_id = $1',
      [USER_ID],
    );
    const authenticated =
      rows.length > 0 && new Date(rows[0].expires_at).getTime() > Date.now();
    const body: ApiResponse = {
      success: true,
      data: { mode: 'live', authenticated },
    };
    res.json(body);
  }),
);

// GET /api/auth/login — where to send the user to authenticate
router.get(
  '/login',
  asyncHandler(async (_req: Request, res: Response) => {
    if (MODE === 'paper') {
      const body: ApiResponse = {
        success: true,
        data: { mode: 'paper', login_url: null, message: 'Paper mode — no login needed' },
      };
      res.json(body);
      return;
    }
    const apiKey = process.env.KITE_API_KEY ?? '';
    const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
    const body: ApiResponse = { success: true, data: { mode: 'live', login_url: loginUrl } };
    res.json(body);
  }),
);

export default router;

import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/index.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message;

  console.error(`[error] ${statusCode} — ${err.message}`);

  const body: ApiResponse = { success: false, error: message };
  res.status(statusCode).json(body);
}

export function notFound(_req: Request, res: Response): void {
  const body: ApiResponse = { success: false, error: 'Route not found' };
  res.status(404).json(body);
}

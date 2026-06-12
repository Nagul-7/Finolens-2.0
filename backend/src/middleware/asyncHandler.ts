import { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 doesn't catch rejected promises from async handlers — this wraps
// them so any thrown/rejected error reaches the global error middleware.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

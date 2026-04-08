import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Correlation ID Middleware.
 *
 * Extracts X-Request-Id from incoming request headers (if present),
 * or generates a new UUID v4. Attaches to:
 * 1. request.correlationId — for use in handlers
 * 2. X-Request-Id response header — for client-side tracing
 *
 * This ID propagates through all logs, events, and downstream calls.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers['x-request-id'] as string) || uuidv4();

    // Attach to request for downstream use
    req.correlationId = correlationId;

    // Set on response headers for client tracing
    _res.setHeader('X-Request-Id', correlationId);

    next();
  }
}

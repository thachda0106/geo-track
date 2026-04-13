import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Extend Express Request to include correlationId
declare module 'express' {
  export interface Request {
    correlationId?: string;
  }
}

/**
 * Correlation ID Middleware.
 *
 * Extracts X-Request-Id from incoming request headers (if present),
 * or lets pino-http generate one (via genReqId in LoggerModule).
 *
 * Responsibilities:
 * 1. Reads X-Request-Id from incoming headers (set by API Gateway, load balancer, or client)
 * 2. Sets X-Request-Id on response headers (for client-side tracing)
 * 3. Attaches correlationId to req object (for use in error filters, guards, etc.)
 *
 * NOTE: The actual log injection is handled by pino-http (via AsyncLocalStorage).
 * This middleware only handles the HTTP header contract + req.correlationId convenience field.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    // pino-http will also read this header via genReqId — they stay in sync
    const correlationId = req.headers['x-request-id'] as string | undefined;

    if (correlationId) {
      // Attach to request for downstream use (error filters, outbox events, etc.)
      req.correlationId = correlationId;
    }

    // Always set on response headers — pino-http may have generated a new ID
    // We'll set it again in a response hook if needed, but this covers the case
    // where the client provided one
    if (correlationId) {
      _res.setHeader('X-Request-Id', correlationId);
    }

    next();
  }
}

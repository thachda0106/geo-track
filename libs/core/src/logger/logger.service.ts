import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

/**
 * Application Logger Service — wraps nestjs-pino's PinoLogger.
 *
 * WHY this wrapper exists:
 * - Implements NestJS LoggerService interface (used by app.useLogger())
 * - Provides a stable API for the rest of the codebase
 * - Under the hood, PinoLogger uses AsyncLocalStorage so every log
 *   line automatically includes the request's correlationId (reqId)
 *
 * HOW correlationId auto-injection works:
 * 1. HTTP request arrives
 * 2. pino-http middleware (registered in LoggerModule) creates a child logger
 *    with `reqId` bound from X-Request-Id header (or generated UUID)
 * 3. That child logger is stored in AsyncLocalStorage for the request scope
 * 4. When ANY service calls this.logger.info('...'), PinoLogger retrieves
 *    the child logger from AsyncLocalStorage → reqId is automatically included
 * 5. No need for developers to pass correlationId manually ever again
 *
 * Usage in any service:
 *   constructor(private readonly logger: AppLoggerService) {}
 *   this.logger.info('Feature created', { featureId });
 *   // Output: {"level":"info","reqId":"abc-123","featureId":"...","msg":"Feature created"}
 */
@Injectable()
export class AppLoggerService implements LoggerService {
  constructor(
    @InjectPinoLogger(AppLoggerService.name)
    private readonly logger: PinoLogger,
  ) {}

  log(message: string, context?: string): void {
    this.logger.info({ context }, message);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(meta, message);
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, message);
  }

  warn(message: string, context?: string): void {
    this.logger.warn({ context }, message);
  }

  debug(message: string, context?: string): void {
    this.logger.debug({ context }, message);
  }

  verbose(message: string, context?: string): void {
    this.logger.trace({ context }, message);
  }

  /**
   * Assign additional context to the current request's logger.
   * Useful for adding userId, tenantId, etc. after authentication.
   *
   * @example
   * // In a guard or interceptor after auth:
   * this.logger.assign({ userId: user.id, role: user.role });
   * // All subsequent logs in this request will include userId and role
   */
  assign(fields: Record<string, unknown>): void {
    this.logger.assign(fields);
  }
}

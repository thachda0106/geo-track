import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pino, { Logger } from 'pino';

/**
 * Structured JSON logger built on Pino.
 * Injects correlationId into every log line for distributed tracing.
 *
 * Usage:
 *   this.logger.info('Feature created', { featureId, userId });
 *   this.logger.error('Failed to save', { error, correlationId });
 */
@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger: Logger;

  constructor(private readonly configService: ConfigService) {
    const isPretty = this.configService.get<string>('LOG_PRETTY') === 'true';
    const level = this.configService.get<string>('LOG_LEVEL') || 'info';

    this.logger = pino({
      level,
      ...(isPretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            },
          }
        : {
            // Production: structured JSON, no transport overhead
            formatters: {
              level: (label: string) => ({ level: label }),
              bindings: () => ({}),
            },
            timestamp: pino.stdTimeFunctions.isoTime,
          }),
    });
  }

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
   * Create a child logger with bound context (e.g., correlationId).
   * Used by the correlation ID middleware.
   */
  child(bindings: Record<string, unknown>): Logger {
    return this.logger.child(bindings);
  }
}

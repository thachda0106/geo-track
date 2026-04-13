import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError, ProblemDetails, toProblemDetails } from './domain-errors';
import { AppLoggerService } from '../logger/logger.service';

/**
 * Global exception filter.
 * Converts all errors to RFC 7807 Problem Details responses.
 *
 * Error handling priority:
 * 1. DomainError → known business error → 4xx with details
 * 2. HttpException → NestJS errors (guards, pipes) → mapped status
 * 3. Unknown Error → bug → 500 with sanitized message
 *
 * Observability integration:
 * - correlationId is automatically included in every log line
 *   thanks to pino-http's AsyncLocalStorage (no manual passing needed)
 * - correlationId is also included in the JSON response body
 *   so clients can reference it when reporting issues
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // Read correlationId for the response body (logs get it automatically via pino-http)
    const correlationId =
      request.correlationId ||
      (request.headers['x-request-id'] as string) ||
      'unknown';

    let problemDetails: ProblemDetails;

    if (exception instanceof DomainError) {
      // ─── Known domain error ─────────────────────────
      problemDetails = toProblemDetails(exception, request.url, correlationId);

      // correlationId is auto-injected by pino-http AsyncLocalStorage
      this.logger.warn(
        `Domain error: ${exception.errorCode} — ${exception.message}`,
        exception.name,
      );
    } else if (exception instanceof HttpException) {
      // ─── NestJS HTTP exception (guards, validation pipes) ──
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      problemDetails = {
        type: `https://api.geotrack.app/errors/http-${status}`,
        title: HttpStatus[status] || 'Error',
        status,
        detail:
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (
                exceptionResponse as Record<string, unknown>
              ).message?.toString() || exception.message,
        instance: request.url,
        correlationId,
      };

      // Attach validation errors from class-validator pipe
      if (
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse &&
        Array.isArray((exceptionResponse as Record<string, unknown>).message)
      ) {
        problemDetails.errors = (
          (exceptionResponse as Record<string, unknown>).message as string[]
        ).map((msg) => ({
          field: 'unknown',
          code: 'VALIDATION',
          message: msg,
        }));
      }

      // correlationId auto-included in this log line by pino-http
      this.logger.warn(`HTTP exception: ${status} — ${exception.message}`);
    } else {
      // ─── Unknown error (bug) ────────────────────────
      const error =
        exception instanceof Error ? exception : new Error(String(exception));

      problemDetails = {
        type: 'https://api.geotrack.app/errors/internal',
        title: 'Internal Server Error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'An unexpected error occurred',
        instance: request.url,
        correlationId,
      };

      // Full stack trace logged with correlationId auto-injected
      this.logger.error(
        `Unhandled error: ${error.message}`,
        error.stack,
        'HttpErrorFilter',
      );
    }

    response.status(problemDetails.status).json(problemDetails);
  }
}

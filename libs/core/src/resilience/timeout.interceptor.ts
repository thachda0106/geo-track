import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

// ═══════════════════════════════════════════════════════
// @Timeout(ms) Decorator
// ═══════════════════════════════════════════════════════

export const TIMEOUT_KEY = 'request_timeout';

/**
 * Set a custom timeout (in milliseconds) for a specific route handler.
 * If not set, the default timeout (30s) is used.
 *
 * @example
 * @Get('heavy-query')
 * @Timeout(60_000) // 60 seconds
 * async heavyQuery() { ... }
 */
export const Timeout = (ms: number) => SetMetadata(TIMEOUT_KEY, ms);

// ═══════════════════════════════════════════════════════
// Timeout Interceptor
// ═══════════════════════════════════════════════════════

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Global interceptor that enforces a timeout on handler execution.
 * Returns 408 Request Timeout if the handler exceeds the limit.
 *
 * Can be overridden per-route using @Timeout(ms) decorator.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const timeoutMs =
      this.reflector.get<number>(TIMEOUT_KEY, context.getHandler()) ??
      DEFAULT_TIMEOUT_MS;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timed out after ${timeoutMs}ms`,
              ),
          );
        }
        return throwError(() => err as Error);
      }),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../logger/logger.service';

// ═══════════════════════════════════════════════════════
// Retry Configuration
// ═══════════════════════════════════════════════════════

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds before first retry (default: 200) */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds (default: 5000) */
  maxDelayMs: number;
  /** Predicate: should we retry this error? (default: all errors) */
  retryOn?: (error: Error) => boolean;
  /** Jitter factor 0-1 to randomize delays (default: 0.1) */
  jitter?: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  jitter: 0.1,
};

// ═══════════════════════════════════════════════════════
// Retry Service
// ═══════════════════════════════════════════════════════

@Injectable()
export class RetryService {
  constructor(private readonly logger: AppLoggerService) {}

  /**
   * Execute a function with exponential backoff retry.
   *
   * Delay formula: min(baseDelay × 2^attempt + jitter, maxDelay)
   *
   * @example
   * const result = await retryService.execute(
   *   () => httpClient.get('/external-api'),
   *   { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000 }
   * );
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry this error
        if (opts.retryOn && !opts.retryOn(lastError)) {
          throw lastError;
        }

        // If this was the last attempt, throw
        if (attempt === opts.maxRetries) {
          this.logger.warn(
            `Retry exhausted after ${opts.maxRetries} attempts: ${lastError.message}`,
            'RetryService',
          );
          throw lastError;
        }

        // Calculate delay with exponential backoff + jitter
        const delay = this.calculateDelay(attempt, opts);

        this.logger.debug(
          `Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms: ${lastError.message}`,
          'RetryService',
        );

        await this.sleep(delay);
      }
    }

    // TypeScript: unreachable, but satisfies compiler
    throw lastError;
  }

  /**
   * Calculate exponential backoff delay with optional jitter.
   *
   * Formula: min(baseDelay × 2^attempt × (1 + random * jitter), maxDelay)
   */
  calculateDelay(attempt: number, opts: RetryOptions): number {
    const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt);
    const jitterMultiplier = 1 + Math.random() * (opts.jitter ?? 0);
    return Math.min(
      Math.round(exponentialDelay * jitterMultiplier),
      opts.maxDelayMs,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

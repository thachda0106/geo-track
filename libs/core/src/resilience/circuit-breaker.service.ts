import {
  Injectable,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';

/**
 * Circuit Breaker Pattern.
 *
 * Prevents cascading failures by short-circuiting calls to a downstream
 * dependency (e.g. database, external API) if it has failed consecutively.
 *
 * States:
 * - CLOSED: Normal operation. Requests pass through.
 * - OPEN: Requests fail immediately or use fallback.
 * - HALF_OPEN: Sending a test request after recovery timeout.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: Date | null = null;

  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT_MS = 30_000;

  /**
   * Executes the given function through the circuit breaker.
   *
   * @param fn The function to execute securely.
   * @param fallback Optional fallback function if circuit is OPEN.
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if it's time to try recovering
      if (
        Date.now() - this.lastFailureTime!.getTime() >
        this.RECOVERY_TIMEOUT_MS
      ) {
        this.logger.warn(
          'Circuit breaker entering HALF_OPEN state to test dependency...',
        );
        this.state = 'HALF_OPEN';
      } else {
        if (fallback) {
          this.logger.debug(
            'Circuit breaker is OPEN, executing provided fallback.',
          );
          return fallback();
        }
        throw new ServiceUnavailableException(
          'Circuit breaker is OPEN - Service unavailable',
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state !== 'CLOSED') {
      this.logger.log('Circuit breaker test succeeded. Circuit is now CLOSED.');
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.lastFailureTime = null;
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.FAILURE_THRESHOLD && this.state !== 'OPEN') {
      this.logger.error(
        `Circuit breaker tripped OPEN after ${this.failureCount} consecutive failures.`,
      );
      this.state = 'OPEN';
    }
  }
}

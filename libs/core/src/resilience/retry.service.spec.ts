import { RetryService, RetryOptions } from './retry.service';
import { createMockLogger } from '../../../../test/helpers/test-setup.module';
import { AppLoggerService } from '../logger/logger.service';

// ═══════════════════════════════════════════════════════
// Retry Service Tests
// ═══════════════════════════════════════════════════════

describe('RetryService', () => {
  let retryService: RetryService;
  let mockLogger: Partial<AppLoggerService>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    retryService = new RetryService(mockLogger as AppLoggerService);
  });

  describe('execute', () => {
    it('should return result on first success (no retry needed)', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retryService.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed on second attempt', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('success');

      const result = await retryService.execute(fn, {
        maxRetries: 3,
        baseDelayMs: 1, // fast for tests
        maxDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries exhausted', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(
        retryService.execute(fn, {
          maxRetries: 2,
          baseDelayMs: 1,
          maxDelayMs: 10,
        }),
      ).rejects.toThrow('persistent failure');

      // 1 initial + 2 retries = 3 total calls
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry when retryOn predicate returns false', async () => {
      const businessError = new Error('business rule violation');
      const fn = jest.fn().mockRejectedValue(businessError);

      await expect(
        retryService.execute(fn, {
          maxRetries: 3,
          baseDelayMs: 1,
          maxDelayMs: 10,
          retryOn: (err) => err.message !== 'business rule violation',
        }),
      ).rejects.toThrow('business rule violation');

      // Should NOT retry — only 1 call
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry when retryOn predicate returns true', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('ok');

      const result = await retryService.execute(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
        retryOn: (err) => err.message === 'timeout',
      });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should log warning when retries exhausted', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(
        retryService.execute(fn, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 10 }),
      ).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry exhausted'),
        'RetryService',
      );
    });

    it('should handle non-Error throws', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      await expect(
        retryService.execute(fn, { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10 }),
      ).rejects.toThrow('string error');
    });
  });

  describe('calculateDelay', () => {
    it('should increase delay exponentially', () => {
      const opts: RetryOptions = {
        maxRetries: 5,
        baseDelayMs: 100,
        maxDelayMs: 10000,
        jitter: 0, // disable jitter for predictable tests
      };

      const delay0 = retryService.calculateDelay(0, opts); // 100 * 2^0 = 100
      const delay1 = retryService.calculateDelay(1, opts); // 100 * 2^1 = 200
      const delay2 = retryService.calculateDelay(2, opts); // 100 * 2^2 = 400

      expect(delay0).toBe(100);
      expect(delay1).toBe(200);
      expect(delay2).toBe(400);
    });

    it('should cap delay at maxDelayMs', () => {
      const opts: RetryOptions = {
        maxRetries: 10,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        jitter: 0,
      };

      const delay5 = retryService.calculateDelay(5, opts); // 1000 * 2^5 = 32000, capped at 5000
      expect(delay5).toBe(5000);
    });

    it('should add jitter when configured', () => {
      const opts: RetryOptions = {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 10000,
        jitter: 0.5,
      };

      // Run multiple times — jitter should make values vary
      const delays = Array.from({ length: 20 }, () =>
        retryService.calculateDelay(0, opts),
      );

      // All should be between 100 (base) and 150 (base * 1.5)
      delays.forEach((d) => {
        expect(d).toBeGreaterThanOrEqual(100);
        expect(d).toBeLessThanOrEqual(150);
      });

      // With 20 samples, there should be some variance
      const unique = new Set(delays);
      expect(unique.size).toBeGreaterThan(1);
    });
  });
});

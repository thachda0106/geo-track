import { Global, Module } from '@nestjs/common';
import { RetryService } from './retry.service';

/**
 * Resilience Module.
 * Provides retry with backoff and timeout patterns.
 *
 * TimeoutInterceptor is registered globally via APP_INTERCEPTOR
 * in app.module.ts, not here — so it has access to Reflector.
 */
@Global()
@Module({
  providers: [RetryService],
  exports: [RetryService],
})
export class ResilienceModule {}

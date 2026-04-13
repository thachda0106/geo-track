import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

// Core library
import {
  AppConfigModule,
  LoggerModule,
  PrismaModule,
  HealthModule,
  ResilienceModule,
  OutboxModule,
  RedisModule,
  HttpErrorFilter,
  JwtAuthGuard,
  RolesGuard,
  TimeoutInterceptor,
  CorrelationIdMiddleware,
  HttpMetricsInterceptor,
} from '@app/core';

// Bounded Context Modules
import { IdentityModule } from './modules/identity/identity.module';
import { GeometryModule } from './modules/geometry/geometry.module';
import { VersioningModule } from './modules/versioning/versioning.module';
import { TrackingModule } from './modules/tracking/tracking.module';

// Events & Scheduling
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

/**
 * Root Application Module.
 *
 * Architecture: Modular Monolith
 * - Each bounded context is a NestJS module with its own service layer
 * - Shared infrastructure via @app/core (global modules)
 * - No cross-module direct dependencies (communicate via events)
 *
 * Module Loading Order:
 * 1. AppConfigModule → validates env vars (fail fast)
 * 2. LoggerModule → structured logging via nestjs-pino (pino-http + AsyncLocalStorage)
 * 3. PrometheusModule → RED metrics collection
 * 4. PrismaModule → database connection
 * 5. ResilienceModule → retry, timeout patterns
 * 6. OutboxModule → event-driven outbox/inbox
 * 7. HealthModule → liveness/readiness probes + /metrics endpoint
 * 8. IdentityModule → auth (needed by other modules)
 * 9. GeometryModule → feature CRUD + spatial
 * 10. VersioningModule → version history
 * 11. TrackingModule → GPS tracking
 *
 * Observability Pipeline (request lifecycle):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 1. CorrelationIdMiddleware  → extract/set X-Request-Id header  │
 * │ 2. pino-http middleware     → create child logger with reqId   │
 * │    (AsyncLocalStorage)        in AsyncLocalStorage scope       │
 * │ 3. HttpMetricsInterceptor  → start timer, record RED metrics  │
 * │ 4. JwtAuthGuard            → authenticate (@Public() bypasses)│
 * │ 5. RolesGuard              → authorize roles                  │
 * │ 6. TimeoutInterceptor      → enforce 30s timeout              │
 * │ 7. Controller/Service      → business logic (all logs         │
 * │                               auto-include reqId)             │
 * │ 8. HttpErrorFilter         → catch errors, log with reqId,    │
 * │                               return RFC 7807 Problem Details │
 * └─────────────────────────────────────────────────────────────────┘
 */
@Module({
  imports: [
    // ─── Events & Background Tasks ─────────────────────
    EventEmitterModule.forRoot({
      global: true,
      wildcard: true,
      delimiter: '.',
    }),
    ScheduleModule.forRoot(),

    // ─── Observability & Metrics ───────────────────────
    // Uses our custom MetricsController (in HealthModule) which has @Public()
    // to bypass JWT auth for Prometheus scrapers
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
    }),

    // ─── Rate Limiting ─────────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 }, // 10 req/s per IP
      { name: 'medium', ttl: 60000, limit: 100 }, // 100 req/min per IP
    ]),

    // ─── Core Infrastructure (global) ──────────────────
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule,
    ResilienceModule,
    OutboxModule,
    HealthModule,

    // ─── Bounded Context Modules ───────────────────────
    IdentityModule,
    GeometryModule,
    VersioningModule,
    TrackingModule,
  ],
  providers: [
    // ─── RED Metrics (Counter + Histogram providers) ───
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    }),
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeCounterProvider({
      name: 'http_requests_errors_total',
      help: 'Total number of HTTP error responses (4xx + 5xx)',
      labelNames: ['method', 'route', 'status_code'],
    }),

    // ─── Global Exception Filter ───────────────────────
    {
      provide: APP_FILTER,
      useClass: HttpErrorFilter,
    },

    // ─── Global Auth Guard (JWT required by default) ───
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // ─── Global RBAC Guard ─────────────────────────────
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    // ─── Global HTTP Metrics Interceptor ────────────────
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },

    // ─── Global Timeout Interceptor ────────────────────
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },

    // ─── Global Rate Limiter ───────────────────────────
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Apply global middleware.
   * Order matters: correlation ID first → then pino-http (auto-applied by nestjs-pino).
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

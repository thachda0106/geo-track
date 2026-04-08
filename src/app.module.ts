import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

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
 * 2. LoggerModule → structured logging available everywhere
 * 3. PrismaModule → database connection
 * 4. ResilienceModule → retry, timeout patterns
 * 5. OutboxModule → event-driven outbox/inbox
 * 6. HealthModule → liveness/readiness probes
 * 7. IdentityModule → auth (needed by other modules)
 * 8. GeometryModule → feature CRUD + spatial
 * 9. VersioningModule → version history
 * 10. TrackingModule → GPS tracking
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
   * Order matters: correlation ID first → then logging.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

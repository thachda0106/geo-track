// ═══════════════════════════════════════════════════════
// @app/core — Shared Core Library
// Used by all modules in the monolith
// ═══════════════════════════════════════════════════════

// Config
export * from './config/config.module';
export * from './config/env.validation';

// Logger
export * from './logger/logger.module';
export * from './logger/logger.service';

// Errors
export * from './errors/domain-errors';
export * from './errors/http-error.filter';

// Auth
export * from './auth/jwt.strategy';
export * from './auth/jwt-auth.guard';
export * from './auth/roles.guard';
export * from './auth/roles.decorator';

// Middleware
export * from './middleware/correlation-id.middleware';

// Health
export * from './health/health.module';

// Database
export * from './prisma/prisma.module';
export * from './prisma/prisma.service';

// Resilience
export * from './resilience/resilience.module';
export * from './resilience/retry.service';
export * from './resilience/timeout.interceptor';
export * from './resilience/circuit-breaker.service';

// Outbox / Inbox (Event-Driven)
export * from './outbox/outbox.module';
export * from './outbox/outbox.service';
export * from './outbox/inbox.service';

// Redis
export * from './redis/redis.module';
export * from './redis/redis.health';

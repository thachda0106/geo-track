# @app/core — Shared Core Library

Shared infrastructure library used by all modules in the GeoTrack monolith. Provides cross-cutting concerns: configuration, authentication, error handling, logging, database access, resilience patterns, and event-driven consistency.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        @app/core                                │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  Config  │  │  Logger  │  │  Errors  │  │  Middleware    │   │
│  │  ──────  │  │  ──────  │  │  ──────  │  │  ──────────   │   │
│  │  Zod env │  │  Pino    │  │  Domain  │  │  Correlation  │   │
│  │  validate│  │  struct  │  │  errors  │  │  ID tracking  │   │
│  └──────────┘  │  JSON    │  │  RFC7807 │  └───────────────┘   │
│                └──────────┘  │  filter  │                      │
│                              └──────────┘                      │
│  ┌──────────────────────────┐  ┌───────────────────────────┐   │
│  │          Auth            │  │       Resilience          │   │
│  │  ────────────────────    │  │  ─────────────────────    │   │
│  │  JWT Strategy + Guard    │  │  Retry (exp. backoff)     │   │
│  │  Roles RBAC Guard        │  │  Circuit Breaker          │   │
│  │  API Key Guard (IoT)     │  │  Timeout Interceptor      │   │
│  │  @Public, @Roles,        │  │  @Timeout decorator       │   │
│  │  @CurrentUser decorators │  │                           │   │
│  └──────────────────────────┘  └───────────────────────────┘   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────────┐    │
│  │  Prisma  │  │  Redis   │  │    Outbox / Inbox         │    │
│  │  ──────  │  │  ─────   │  │  ─────────────────────    │    │
│  │  DB conn │  │  ioredis │  │  Transactional Outbox     │    │
│  │  PostGIS │  │  health  │  │  Inbox deduplication      │    │
│  │  slow qry│  │  check   │  │  Outbox Relay (polling)   │    │
│  └──────────┘  └──────────┘  │  Dead Letter Queue        │    │
│                              └───────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Module Reference

### Config (`config/`)

Fail-fast environment validation at startup using Zod.

| File | Export | Purpose |
|------|--------|---------|
| `config.module.ts` | `AppConfigModule` | Global NestJS config module with Zod validation |
| `env.validation.ts` | `validateEnv`, `envSchema`, `EnvConfig` | Zod schema defining all required/optional env vars |

**Validated env vars:**

| Variable | Type | Required | Default |
|----------|------|----------|---------|
| `NODE_ENV` | `development\|staging\|production\|test` | No | `development` |
| `PORT` | number | No | `3000` |
| `DATABASE_URL` | URL string | **Yes** | — |
| `REDIS_HOST` | string | No | `localhost` |
| `KAFKA_BROKERS` | string | No | `localhost:9092` |
| `JWT_SECRET` | string (min 32 chars) | **Yes** | — |
| `LOG_LEVEL` | `fatal\|error\|warn\|info\|debug\|trace` | No | `info` |
| `SENTRY_DSN` | URL string | No | — |
| `INGEST_API_KEY` | string (min 32 chars) | No | — |

**How it works:** If any required env var is missing or invalid at startup, the app throws a detailed error and refuses to start:
```
❌ Environment validation failed:
  DATABASE_URL: Required
  JWT_SECRET: String must contain at least 32 character(s)
```

---

### Logger (`logger/`)

Structured JSON logging with Pino, supporting correlation IDs for distributed tracing.

| File | Export | Purpose |
|------|--------|---------|
| `logger.module.ts` | `LoggerModule` | NestJS module providing `AppLoggerService` |
| `logger.service.ts` | `AppLoggerService` | Pino-based structured logger implementing NestJS `LoggerService` |

**Behavior by environment:**

| | Development | Production |
|---|---|---|
| Format | Pretty-printed (colorized) | JSON (machine-parseable) |
| Transport | `pino-pretty` | None (stdout direct) |
| Overhead | Slightly higher | Minimal |

**Usage:**
```typescript
// Standard logging
this.logger.info('Feature created', { featureId, userId });

// Child logger with bound context (for correlation)
const child = this.logger.child({ correlationId: 'abc-123' });
```

---

### Errors (`errors/`)

Domain-specific error hierarchy with RFC 7807 Problem Details response format.

| File | Export | Purpose |
|------|--------|---------|
| `domain-errors.ts` | `DomainError`, concrete errors, `toProblemDetails()` | Error class hierarchy + RFC 7807 converter |
| `http-error.filter.ts` | `HttpErrorFilter` | Global exception filter — catches all errors, returns Problem Details |

**Error hierarchy:**

| Error Class | HTTP Status | Error Code | When to use |
|-------------|:-----------:|------------|-------------|
| `ValidationError` | 400 | `VALIDATION_ERROR` | Input validation failed (array of field errors) |
| `InvalidGeometryError` | 400 | `INVALID_GEOMETRY` | Invalid GeoJSON geometry |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Authentication required/failed |
| `ForbiddenError` | 403 | `FORBIDDEN` | Insufficient permissions |
| `NotFoundError` | 404 | `NOT_FOUND` | Resource not found |
| `ConflictError` | 409 | `VERSION_CONFLICT` | Optimistic locking conflict |
| `DuplicateError` | 409 | `DUPLICATE` | Duplicate resource |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| `BusinessRuleError` | 422 | `BUSINESS_RULE_VIOLATION` | Business rule violated |

**Response format (RFC 7807):**
```json
{
  "type": "https://api.geotrack.app/errors/not-found",
  "title": "NOT FOUND",
  "status": 404,
  "detail": "Feature not found: abc-123",
  "instance": "/api/v1/features/abc-123",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error handling priority in `HttpErrorFilter`:**
1. `DomainError` → known business error → 4xx with details
2. `HttpException` → NestJS errors (guards, pipes) → mapped status
3. Unknown `Error` → bug → 500 with sanitized message (no stack leak)

---

### Auth (`auth/`)

Authentication (JWT + API Key) and authorization (RBAC) guards and decorators.

| File | Export | Purpose |
|------|--------|---------|
| `jwt.strategy.ts` | `JwtStrategy`, `JwtPayload`, `AuthenticatedUser` | Passport JWT strategy — validates Bearer tokens |
| `jwt-auth.guard.ts` | `JwtAuthGuard` | Global guard — all routes require JWT unless `@Public()` |
| `roles.guard.ts` | `RolesGuard` | RBAC guard — checks user role against `@Roles()` |
| `roles.decorator.ts` | `@Public()`, `@Roles()`, `@CurrentUser()` | Route-level decorators |
| `api-key.guard.ts` | `ApiKeyGuard`, `@UseApiKey()` | API key auth for machine-to-machine (IoT ingest) |

**Auth flow:**
```
Request arrives
    │
    ▼
JwtAuthGuard (global)
    ├── @Public() decorated? → skip auth ✅
    └── Validate Bearer JWT token
        ├── Valid → attach user to request
        │       │
        │       ▼
        │   RolesGuard
        │       ├── @Roles() decorated? → check user.role ∈ required roles
        │       └── No @Roles() → any authenticated user OK ✅
        │
        └── Invalid/missing → 401 Unauthorized
```

**JWT payload shape:**
```typescript
interface JwtPayload {
  sub: string;    // userId
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  iat: number;
  exp: number;
}
```

**API Key auth** (for IoT devices):
```typescript
@Public()      // Bypass JWT
@UseApiKey()   // Require X-API-Key header instead
@Post('ingest')
async ingest() { ... }
```
Uses `timingSafeEqual` for constant-time comparison to prevent timing attacks.

---

### Middleware (`middleware/`)

| File | Export | Purpose |
|------|--------|---------|
| `correlation-id.middleware.ts` | `CorrelationIdMiddleware` | Extract/generate X-Request-Id for distributed tracing |

**How it works:**
1. Check incoming `X-Request-Id` header
2. If missing, generate a new UUID v4
3. Attach to `request.correlationId` for handlers
4. Set `X-Request-Id` on response for client tracing

This ID propagates through all logs, events, and downstream calls.

---

### Health (`health/`)

Kubernetes liveness and readiness probe endpoints.

| File | Export | Purpose |
|------|--------|---------|
| `health.module.ts` | `HealthModule` | NestJS module with Terminus health checks |
| `health.controller.ts` | `HealthController` | `/health` and `/health/ready` endpoints |

**Endpoints:**

| Path | Probe type | Checks | K8s usage |
|------|-----------|--------|-----------|
| `GET /health` | Liveness | None (is process alive?) | `livenessProbe` — restart pod if failing |
| `GET /health/ready` | Readiness | Database, Redis, Memory (<512MB) | `readinessProbe` — stop routing traffic |

Both are decorated with `@Public()` — no authentication required (for K8s probes and load balancers).

---

### Prisma (`prisma/`)

Managed PostgreSQL/PostGIS connection with lifecycle hooks.

| File | Export | Purpose |
|------|--------|---------|
| `prisma.module.ts` | `PrismaModule` | Global NestJS module exporting `PrismaService` |
| `prisma.service.ts` | `PrismaService` | Extends `PrismaClient` with lifecycle hooks + PostGIS support |

**Features:**
- Auto-connect on module init, disconnect on destroy
- Slow query logging in development (>100ms)
- `executeRawSpatial()` — raw SQL for PostGIS operations (Prisma doesn't natively support PostGIS)

---

### Resilience (`resilience/`)

Fault-tolerance patterns for external service calls.

| File | Export | Purpose |
|------|--------|---------|
| `resilience.module.ts` | `ResilienceModule` | NestJS module providing all resilience services |
| `retry.service.ts` | `RetryService` | Exponential backoff retry with jitter |
| `circuit-breaker.service.ts` | `CircuitBreakerService` | Circuit breaker (CLOSED → OPEN → HALF_OPEN) |
| `timeout.interceptor.ts` | `TimeoutInterceptor`, `@Timeout()` | Global 30s request timeout, per-route override |

**Retry:**
```
Attempt 0: immediate
Attempt 1: 200ms  × 2^0 = 200ms  + jitter
Attempt 2: 200ms  × 2^1 = 400ms  + jitter
Attempt 3: 200ms  × 2^2 = 800ms  + jitter
(capped at maxDelayMs)
```

**Circuit Breaker states:**
```
CLOSED ──(5 failures)──→ OPEN ──(30s timeout)──→ HALF_OPEN ──(success)──→ CLOSED
                                                          └──(failure)──→ OPEN
```

**Timeout:**
```typescript
@Get('heavy-query')
@Timeout(60_000)       // Override default 30s → 60s for this route
async heavyQuery() { ... }
```

---

### Outbox / Inbox (`outbox/`)

Event-driven consistency using the Transactional Outbox and Inbox patterns.

| File | Export | Purpose |
|------|--------|---------|
| `outbox.module.ts` | `OutboxModule` | NestJS module for all outbox/inbox services |
| `outbox.service.ts` | `OutboxService` | Write events to outbox table within DB transaction |
| `outbox-relay.service.ts` | `OutboxRelayService` | Poll outbox table, emit events, handle retries + DLQ |
| `inbox.service.ts` | `InboxService` | Idempotent event consumption (deduplication) |

**Outbox flow:**
```
Business logic + Event write (same DB transaction)
    │
    ▼
┌─────────────────────────┐
│  outbox table           │
│  event_type, payload,   │
│  published_at = NULL    │
└────────┬────────────────┘
         │ OutboxRelayService polls every 1s
         ▼
┌─────────────────────────┐
│  EventEmitter2 (local)  │──→ Consumers handle events
│  (future: Kafka)        │
└─────────────────────────┘
         │
         ▼ on success
    markPublished()
         │
         ▼ on failure (retry < max)
    incrementRetry()
         │
         ▼ on failure (retry >= max)
    moveToDeadLetter() → outbox_dlq table
```

**Inbox (idempotent consumption):**
```typescript
// Atomic claim — INSERT succeeds only if event_id doesn't exist
const processed = await this.inbox.processOnce(eventId, eventType, async () => {
  // Your handler — runs only once per eventId
  await this.featureService.handleCreated(payload);
});
```

**Relay safety guarantees:**
- `FOR UPDATE SKIP LOCKED` — prevents double-processing across replicas
- Published events cleaned up hourly (>24h old)
- Failed events → DLQ after max retries (default: 5)

---

### Redis (`redis/`)

Global Redis connection with health indicator.

| File | Export | Purpose |
|------|--------|---------|
| `redis.module.ts` | `RedisModule` | Global ioredis connection module |
| `redis.health.ts` | `RedisHealthIndicator` | Terminus health check (PING/PONG) |

**Used for:** Caching, rate limiting state, future pub/sub.

---

## How to Import

All exports are available from the package root:

```typescript
import {
  // Config
  AppConfigModule,

  // Auth
  JwtAuthGuard, RolesGuard, Public, Roles, CurrentUser, UseApiKey,

  // Errors
  NotFoundError, ConflictError, ValidationError,

  // Logger
  AppLoggerService,

  // Database
  PrismaService,

  // Resilience
  RetryService, CircuitBreakerService, TimeoutInterceptor,

  // Outbox
  OutboxService, InboxService,

  // Redis
  RedisModule,
} from '@app/core';
```

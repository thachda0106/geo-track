# OpenCode Agent Instructions

## Project Overview
GeoTrack — Modular monolith geospatial platform ("Git for maps" + real-time fleet tracking). Built with NestJS, PostgreSQL/PostGIS, TimescaleDB, Redis, Redpanda (Kafka).

## Key Commands (Must Use These Exact Commands)

### Development
```bash
npm run docker:up          # Start PostgreSQL+PostGIS+TimescaleDB, Redis, Redpanda
npm run db:generate        # Generate Prisma client (required before lint/typecheck)
npm run db:migrate         # Run database migrations
npm run start:dev          # Start dev server with hot reload
```

### Testing (Order Matters)
```bash
npm run lint               # ESLint with auto-fix
npm run test               # Unit tests only
npm run test:integration   # Integration tests (requires Docker)
npm run test:e2e           # End-to-end tests (requires Docker/Testcontainers)
```

### Database
```bash
npm run db:seed            # Seed sample data
npm run db:studio          # Open Prisma Studio
```

## Architecture Notes

### Module Structure
- **Modular monolith** with 4 bounded contexts (DDD/Clean Architecture):
  1. `identity/` - Auth, users, RBAC
  2. `geometry/` - Feature CRUD + PostGIS spatial ops
  3. `versioning/` - Snapshots, diffs, timeline, revert
  4. `tracking/` - GPS sessions, TimescaleDB locations
- Shared infrastructure in `libs/core/` (`@app/core` imports)
- **No cross-module direct dependencies** - communicate via events only

### Database Schemas
- Multi-schema Prisma: `identity.*`, `geometry.*`, `versioning.*`, `tracking.*`, `infrastructure.*`
- PostGIS spatial operations use raw SQL via `PrismaService.executeRawSpatial()`
- TimescaleDB for time-series location data

### Testing Infrastructure
- **Testcontainers** for PostgreSQL and Redpanda in integration/e2e tests
- Different Jest configs: `jest-e2e.json`, `jest-integration.json`
- Integration/e2e tests **require Docker running**

## Critical Constraints

### Environment Setup
1. **Always run `npm run db:generate`** before lint/typecheck/build (Prisma client generation)
2. **Docker required** for integration/e2e tests and development
3. Database runs on port **5433** (not 5432) to avoid conflicts

### Code Conventions
- **All routes require JWT auth by default** - use `@Public()` decorator to bypass
- Use **domain errors** (`NotFoundError`, `ConflictError`, etc.) not generic exceptions
- **RFC 7807 Problem Details** format for all error responses
- **Structured logging** with correlation IDs via `AppLoggerService`
- **Event-driven communication** between modules via outbox/inbox pattern

### Testing Order
**Always run in this sequence:**
1. `npm run lint` (includes auto-fix)
2. `npm run test` (unit tests)
3. `npm run test:integration` (integration tests, requires Docker)
4. `npm run test:e2e` (e2e tests, requires Docker)

## Path Aliases
```typescript
import { ... } from '@app/core';      // → libs/core/src
import { ... } from '@app/core/*';     // → libs/core/src/*
// Note: @app/shared exists in tsconfig but libs/shared/ directory doesn't exist
```

## CI/CD Pipeline
- Lint → Type check → Unit tests → Integration tests → E2E tests → Build
- **Prisma client generation** happens in CI before lint/typecheck
- Integration/e2e tests run **with Testcontainers** in CI

## Gotchas
- **PostGIS operations**: Use raw SQL via `PrismaService.executeRawSpatial()`
- **Event handling**: Outbox pattern ensures transactional consistency
- **Authentication**: `@Public()` bypasses JWT, `@UseApiKey()` for IoT ingest
- **Timeouts**: Default 30s request timeout, override with `@Timeout()` decorator
- **Redis**: Used for caching, rate limiting, future pub/sub
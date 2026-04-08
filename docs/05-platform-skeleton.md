# Phase 5 — Platform Skeleton & Dev Setup

> Phase 5 of the GeoTrack Minimum Build System Workflow.
> Merges: Phase 13 (Platform Core) + Phase 14 (Testing Strategy) + Phase 15 (Developer Platform)

## Core Library Inventory (`@app/core`)

All shared infrastructure is in `libs/core/src/` and available to every bounded context
via `import { ... } from '@app/core'`.

### Module Registry

| Module | Directory | Global? | Purpose |
|--------|-----------|---------|---------|
| **AppConfigModule** | `config/` | ✅ | Zod-based env validation, fail-fast on missing vars |
| **LoggerModule** | `logger/` | ✅ | Structured JSON logging (Pino), correlation ID injection |
| **PrismaModule** | `prisma/` | ✅ | Database lifecycle, slow query logging, PostGIS raw SQL helper |
| **ResilienceModule** | `resilience/` | ✅ | Retry with exponential backoff, global timeout interceptor |
| **OutboxModule** | `outbox/` | ✅ | Transactional outbox (at-least-once) + inbox deduplication |
| **HealthModule** | `health/` | ❌ | Liveness (`/health`) and readiness (`/health/ready`) probes |

### Cross-Cutting Concerns

| Concern | Implementation | Registration |
|---------|---------------|-------------|
| **Authentication** | `JwtStrategy` + `JwtAuthGuard` | `APP_GUARD` (global) |
| **Authorization** | `RolesGuard` + `@Roles()` decorator | `APP_GUARD` (global) |
| **Error Handling** | `HttpErrorFilter` + `DomainError` hierarchy | `APP_FILTER` (global) |
| **Timeout** | `TimeoutInterceptor` + `@Timeout(ms)` decorator | `APP_INTERCEPTOR` (global) |
| **Correlation ID** | `CorrelationIdMiddleware` | Middleware (all routes) |
| **Public Routes** | `@Public()` decorator | Per-handler opt-out |

### Error Hierarchy

```
DomainError (abstract)
├── ValidationError (400) — field-level validation failures
├── InvalidGeometryError (400) — PostGIS geometry issues
├── NotFoundError (404) — resource not found
├── ConflictError (409) — optimistic locking / version conflict
├── DuplicateError (409) — unique constraint violation
├── ForbiddenError (403) — insufficient permissions
├── RateLimitError (429) — too many requests
└── BusinessRuleError (422) — domain rule violation
```

All errors are mapped to **RFC 7807 Problem Details** by `HttpErrorFilter`.

---

## Bounded Context Modules

| Module | Schema | Controllers | Service |
|--------|--------|------------|---------|
| **IdentityModule** | `identity` | Auth (register/login), Profile | User CRUD, JWT, bcrypt |
| **GeometryModule** | `geometry` | Feature CRUD, Spatial queries | PostGIS ops, outbox pattern |
| **VersioningModule** | `versioning` | Timeline, Diff, Revert | Snapshot management |
| **TrackingModule** | `tracking` | Session mgmt, Location ingest | TimescaleDB, batch insert |

---

## Testing Architecture

### Test Pyramid

```
          ┌──────────┐
          │   E2E     │  ← Full app + DB (test/app.e2e-spec.ts)
          ├──────────┤
          │ Integr.   │  ← Module + mock DB (test/integration/*.spec.ts)
          ├──────────┤
          │   Unit    │  ← Isolated functions (*.spec.ts alongside source)
          └──────────┘
```

### Coverage Targets

| Level | Target | Config |
|-------|--------|--------|
| Unit | ≥ 80% | `npm run test:cov` |
| Integration | ≥ 60% | `npm run test:integration` |
| E2E | Critical paths | `npm run test:e2e` |

### Test Helpers (`test/helpers/`)

| Helper | Purpose |
|--------|---------|
| `test-setup.module.ts` | `createTestApp()` factory, mock Prisma, mock Logger |
| `test-auth.ts` | Pre-defined test users (viewer/editor/admin), JWT generation |
| `test-factories.ts` | Factory functions: `createTestUser()`, `createTestFeature()`, etc. |

### Current Test Coverage (45 tests)

| Suite | Tests | Location |
|-------|-------|----------|
| Domain Errors | 14 | `libs/core/src/errors/domain-errors.spec.ts` |
| Env Validation | 10 | `libs/core/src/config/env.validation.spec.ts` |
| Retry Service | 10 | `libs/core/src/resilience/retry.service.spec.ts` |
| Identity Service | 10 | `src/modules/identity/identity.service.spec.ts` |
| Health Integration | 1 | `test/integration/health.integration.spec.ts` |

---

## Local Development Environment

### Prerequisites

- Node.js 20+ LTS
- Docker & Docker Compose
- npm 10+

### Quick Start (5 minutes)

```bash
# 1. Clone & install
git clone <repo-url>
cd map-history
npm install

# 2. Start infrastructure
npm run docker:up       # PostgreSQL + PostGIS + TimescaleDB, Redis, Redpanda

# 3. Setup database
npm run db:generate     # Generate Prisma client
npm run db:migrate      # Run migrations
npm run db:seed         # Seed demo data

# 4. Start dev server
npm run start:dev       # http://localhost:3000

# Endpoints:
# API:      http://localhost:3000/api/v1
# Swagger:  http://localhost:3000/docs
# Health:   http://localhost:3000/health
# Redpanda: http://localhost:8080
```

### Seed Data

Demo users (password: `Password123!`):
| Email | Role |
|-------|------|
| `viewer@geotrack.dev` | viewer |
| `editor@geotrack.dev` | editor |
| `admin@geotrack.dev` | admin |

Sample features: Point, LineString, Polygon (Ho Chi Minh City area)

### Docker Services

| Service | Ports | Health Check |
|---------|-------|-------------|
| PostgreSQL + PostGIS + TimescaleDB | 5432 | `pg_isready` |
| Redis 7 | 6379 | `redis-cli ping` |
| Redpanda (Kafka) | 9092, 8080 (console) | `rpk cluster health` |

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start dev server (hot reload) |
| `npm run build` | Build for production |
| `npm run test` | Run unit tests |
| `npm run test:integration` | Run integration tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run lint` | Lint & fix |
| `npm run docker:up` | Start infrastructure |
| `npm run docker:down` | Stop infrastructure |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio |

---

## Containerized Deployment

### Dockerfile

Multi-stage build:
1. **deps** — `npm ci --omit=dev` (production dependencies)
2. **build** — TypeScript compile + Prisma generate
3. **production** — Alpine, non-root user, health check, migrate-then-start

```bash
docker build -t geotrack .
docker run -p 3000:3000 --env-file .env geotrack
```

### Docker Compose (optional app service)

The `docker-compose.yml` includes a commented `app` service that can be uncommented
to run the full stack in containers.

---

## Architecture Decisions

| ADR | Decision |
|-----|----------|
| ADR-001 | Git-like versioning (snapshot + diff per version) |
| ADR-002 | TimescaleDB for high-throughput location data |
| ADR-003 | Modular monolith (not microservices) |
| ADR-004 | PostGIS for authoritative spatial operations |
| ADR-005 | Socket.IO for real-time tracking updates |

---

## Quality Gate Checklist

| Criterion | Status |
|-----------|--------|
| Core library: logger, config, errors, auth, resilience, outbox | ✅ All built + tested |
| `docker-compose up` starts full local environment | ✅ Verified |
| Test pyramid defined with examples at each level | ✅ Unit + Integration |
| README has "zero to running" instructions | ✅ Complete |
| Build compiles without errors | ✅ `npm run build` passes |
| All 45 tests pass | ✅ `npm run test` passes |

---

## Connection to Next Phase

**Phase 6 (CI/CD Pipeline)** — Automate build, test, and deploy:
- GitHub Actions workflow for lint + test on PR
- Staging deployment pipeline
- Docker image build + push

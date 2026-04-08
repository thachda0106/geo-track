# GeoTrack — Geospatial Operations Platform

> "Git for maps" + "Real-time fleet tracker" in a single platform.

## 🚀 Quick Start (5 minutes)

### Prerequisites

- **Node.js** 20+ LTS
- **Docker** & **Docker Compose** (for PostgreSQL, Redis, Kafka)
- **npm** 10+

### 1. Clone & Install

```bash
git clone <repo-url>
cd map-history
npm install
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL (+ PostGIS + TimescaleDB), Redis, Redpanda (Kafka)
npm run docker:up

# Verify containers are healthy
docker-compose ps
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# (Optional) Seed sample data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

Server starts at:
- **API**: http://localhost:3000/api/v1
- **Swagger Docs**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health
- **Redpanda Console**: http://localhost:8080

---

## 📁 Project Structure

```
map-history/
├── docs/                          # Architecture & System Documentation
│   ├── system-knowledge/          # Deep dive architectural guides
│   │   ├── 01_system_architecture_deep.md
│   │   ├── 03_data_flow_streaming_redpanda.md
│   │   ├── 08_observability_deep_dive.md
│   │   ├── database_design_deep_dive.md
│   │   ├── geo_tracking_architecture.md
│   │   └── real_time_layer_deep_dive.md
│   ├── adr/                       # Architecture Decision Records
│   │   ├── ADR-001-versioning-strategy.md
│   │   └── ...
│
├── libs/                          # Shared libraries
│   └── core/src/                  # @app/core — cross-cutting concerns
│       ├── auth/                  # JWT strategy, guards, decorators
│       ├── config/                # Env validation (Zod)
│       ├── errors/                # Domain errors + RFC 7807 filter
│       ├── health/                # Liveness/readiness probes
│       ├── logger/                # Structured JSON logger (Pino)
│       ├── middleware/            # Correlation ID
│       ├── outbox/                # Outbox/Inbox transactional relay system
│       ├── prisma/                # Database service
│       └── resilience/            # Circuit breakers & retries
│
├── src/                           # Application source
│   ├── main.ts                    # Bootstrap (Helmet, CORS, Swagger)
│   ├── app.module.ts              # Root module wiring
│   └── modules/                   # Bounded Context Modules
│       ├── identity/              # Auth, users, RBAC
│       ├── geometry/              # Feature CRUD + PostGIS spatial
│       ├── versioning/            # Version history, timeline, revert
│       └── tracking/              # GPS sessions, locations, trails
│
├── prisma/
│   └── schema.prisma              # Multi-schema (identity, geometry, versioning, tracking)
│
├── test/                          # Comprehensive testing suites
│   ├── helpers/                   # Test utilities
│   ├── setup-containers.ts        # Testcontainers spinups (Pg/Redpanda)
│   ├── *.e2e-spec.ts              # End-to-end tests
│   └── *.integration.spec.ts      # Component Integration tests
│
├── docker-compose.yml             # Dev infrastructure
├── .env.example                   # Environment template
└── package.json                   # Dependencies & scripts
```

## 🏗️ Architecture

**Modular Monolith** with 4 bounded contexts. 
*Note: The platform is currently undergoing a refactoring phase to migrate from a traditional n-tier structure towards **Clean Architecture / Domain-Driven Design (DDD)**.*

| Module | Responsibility | Database Schema | Architecture Status |
|--------|---------------|----------------|-------------------|
| **Identity** | Auth, users, RBAC | `identity.*` | ✅ Clean Architecture (DDD + CQRS) |
| **Geometry** | Feature CRUD, PostGIS spatial ops | `geometry.*` | ✅ Clean Architecture (DDD + CQRS) |
| **Versioning** | Snapshots, diffs, timeline, revert | `versioning.*` | ✅ Clean Architecture (DDD + CQRS) |
| **Tracking** | GPS sessions, TimescaleDB locations | `tracking.*` | ✅ Clean Architecture (DDD + CQRS) |

See [Architecture Docs](./docs/) for detailed design.

## 📝 npm Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start dev server (hot reload) |
| `npm run build` | Build for production |
| `npm run test` | Run all unit tests |
| `npm run test:integration` | Run integration tests (requires Docker) |
| `npm run test:e2e` | Run end-to-end tests (requires Docker/Testcontainers) |
| `npm run lint` | Fully compliant strict ESLint scanning |
| `npm run docker:up` | Start infrastructure |
| `npm run docker:down` | Stop infrastructure |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio |

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 LTS + TypeScript |
| Framework | NestJS 11 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Time-Series | TimescaleDB |
| Cache/PubSub | Redis 7 |
| Message Queue | Kafka (Redpanda) via Event-Driven Outbox pattern |
| Testing Infrastructure | Testcontainers (dynamic Pg/Redpanda test-suites) |
| ORM | Prisma 6 + raw SQL (PostGIS) |
| Auth | JWT (Passport) |
| Logging | Pino (structured JSON) |
| Docs | Swagger (OpenAPI 3.0) |

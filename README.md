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
├── docs/                          # Architecture documentation (Phases 1-4)
│   ├── 01-business-domain-discovery.md
│   ├── 02-architecture-domain-design.md
│   ├── 03-data-api-contract-design.md
│   ├── 04-system-flows-tech-stack.md
│   └── adr/                       # Architecture Decision Records
│       ├── ADR-001-versioning-strategy.md
│       ├── ADR-002-timescaledb-tracking.md
│       ├── ADR-003-modular-monolith.md
│       ├── ADR-004-postgis-spatial-ops.md
│       └── ADR-005-socketio-realtime.md
│
├── libs/                          # Shared libraries
│   └── core/src/                  # @app/core — cross-cutting concerns
│       ├── auth/                  # JWT strategy, guards, decorators
│       ├── config/                # Env validation (Zod)
│       ├── errors/                # Domain errors + RFC 7807 filter
│       ├── health/                # Liveness/readiness probes
│       ├── logger/                # Structured JSON logger (Pino)
│       ├── middleware/            # Correlation ID
│       └── prisma/                # Database service
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
├── scripts/
│   └── init-db.sql                # Database initialization (schemas, extensions)
│
├── docker-compose.yml             # Dev infrastructure
├── .env.example                   # Environment template
└── package.json                   # Dependencies & scripts
```

## 🏗️ Architecture

**Modular Monolith** with 4 bounded contexts:

| Module | Responsibility | Database Schema |
|--------|---------------|----------------|
| **Identity** | Auth, users, RBAC | `identity.*` |
| **Geometry** | Feature CRUD, PostGIS spatial ops | `geometry.*` |
| **Versioning** | Snapshots, diffs, timeline, revert | `versioning.*` |
| **Tracking** | GPS sessions, TimescaleDB locations | `tracking.*` |

See [Architecture Docs](./docs/) for detailed design.

## 📝 npm Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start dev server (hot reload) |
| `npm run build` | Build for production |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run integration tests |
| `npm run lint` | Lint & fix |
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
| Message Queue | Kafka (Redpanda for dev) |
| ORM | Prisma + raw SQL (PostGIS) |
| Auth | JWT (Passport) |
| Logging | Pino (structured JSON) |
| Docs | Swagger (OpenAPI 3.0) |

# 07. Implementation Build Strategy

This document outlines the architectural decisions and implementation steps that were taken to scaffold and implement the GeoTrack application's core backend components following a Modular Monolith architecture in NestJS.

## 1. System Architecture: Modular Monolith
To balance speed of development with future scalable extraction into microservices, we structured the NestJS server as a **Modular Monolith**:
- A single deployable container.
- Cleanly separated, bounded context modules (Identity, Geometry, Versioning, Tracking).
- Internal messaging via `EventEmitter2` combined with an `Outbox/Inbox` pattern to enforce eventual consistency between modules without tight coupling.

## 2. Shared Core Foundation (`@app/core`)
Before implementing domains, we established a shared foundational library.
- **Config & Envs**: Built-in `ConfigModule` and Joi validation schema to enforce strict configuration rules.
- **Logging**: A standardized `AppLoggerService` integrating `Pino` to emit JSON-formatted structured logs, with correlational IDs.
- **Prisma & DB**: `PrismaService` handling dynamic connection lifecycle and injecting standard logging.
- **Health Checks**: Standard integration with NestJS Terminus for Liveness and Readiness probes.
- **Resilience**: A generic generic retry mechanism (`RetryService`) and a timeout interceptor.

## 3. The Outbox / Inbox Pattern
To build robust event-driven workflows where different modules react to changes (e.g., creating a historical version when a feature is updated), we avoided synchronous inter-module calls.
- **OutboxService**: Modules use this to save domain events in the database *alongside* their local transactions (e.g., `FeatureCreated`).
- **InboxService**: Consuming modules (like Versioning) record successfully processed event IDs in an Inbox log, deduplicating incoming events ensuring idempotent executions exactly once.
- **Outbox Relay**: A `Cron` service running every few seconds pulls pending outbox events and dispatches them internally over `EventEmitter2`.

## 4. Vertical Slice Implementation

### 4.1. Access Management (Identity Module)
- Responsible for Authentication (JWT) and RBAC Authorization.
- Enforced Role-based access decorators (`@Roles('admin', 'operator')`) on all domain controllers.

### 4.2. Spatial Features (Geometry Module)
- Serves as the authoritative truth for spatial coordinates.
- Uses PostGIS columns (e.g., `geometry(Geometry, 4326)`) and GiST indexes, created via raw SQL within Prisma Migrations to overcome Prisma's lack of native spatial types.
- Dispatches `FeatureCreated` / `FeatureUpdated` / `FeatureDeleted` domain events to the Outbox.

### 4.3. Historical Timeline (Versioning Module)
- Operates totally autonomously from Geometry's feature creation endpoints.
- Listens to internal domain events utilizing the `InboxService` to process events securely.
- Extracts and snapshots valid geometries so the timeline can accurately visualize the exact shape of a feature exactly as it was during that specific version time.

### 4.4. Telemetry (Tracking Module)
- Handles raw ping arrays uploaded by IoT units.
- Utilizes caching/redis components before ultimately pushing arrays of point-in-time entries down to PostgreSQL via bulk Prisma writes.

## 5. Testing Strategy
- **Unit Testing**: Tests domain services with mock adapters isolating side-effects.
- **Integration Testing**: Spin up `@nestjs/testing` modules bounded tightly to specific domains, replacing real HTTP requests with direct Service/Consumer class manipulation but hitting a real local testing database (on Port 5433).
- **PostGIS Awareness**: In integration testing, queries natively test interactions with `ST_AsGeoJSON` and `ST_SetSRID`, ensuring accuracy mapping geometry columns to DTOs.
- **E2E Testing**: Focuses on event-driven behavior specifically checking that `GeometryService -> Outbox -> OutboxRelayService -> Event -> InboxService -> VersioningConsumer` operates reliably and correctly exactly once. By making the test suite pause with a 3000ms delay, the E2E framework allows enough time for the asynchronous cron and promise chains to settle before executing assertions.

## 6. Docker Local Infrastructure Stabilization
To prevent collisions with existing development environments, explicit test ports mappings were chosen:
- Postgres Primary: `5433`
- Redis Primary: `6380`

Using standard docker network isolation, testing pipelines were run against deterministic environmental configurations managed entirely via `.env.test` combined with `dotenv-cli`.

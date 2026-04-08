---
description: "Phases 11–20: Technology Selection → Platform & Infrastructure → Service Development → Observability"
---

# Phases 11–20: Tech Selection → Platform → Build → Observe

---

# PHASE 11 — TECHNOLOGY SELECTION

## 1. Goal
Select technology for every layer with documented rationale, alternatives, and trade-offs.

## 2. Key Decisions
One decision per layer — see full comparison matrix:

| Layer | Decision | Why | Alternatives | Trade-offs |
|-------|----------|-----|-------------|------------|
| Language | TypeScript | Type safety, ecosystem | Go, Java, Python, Rust | Slower than Go |
| Framework | NestJS | DDD-friendly, DI, modular | Express, Fastify, Spring Boot | Opinionated |
| API Gateway | Custom NestJS | Full control, BFF | Kong, AWS API GW | Must build yourself |
| Auth | JWT + Passport | Stateless | Keycloak, Auth0 | Revocation needs blocklist |
| SQL DB | PostgreSQL | JSONB, reliability | MySQL, CockroachDB | Vertical scaling limits |
| Cache | Redis | Speed, data structures | Memcached, Dragonfly | Memory cost |
| Search | OpenSearch | Full-text, facets | Elasticsearch, Algolia | Ops complexity |
| Broker | Apache Kafka | Ordering, replay | RabbitMQ, SQS+SNS, NATS | Ops complexity |
| ORM | TypeORM | NestJS integration | Prisma, Knex, Drizzle | Migration quirks |
| Container | ECS Fargate | Serverless containers | Kubernetes, Cloud Run | Less flexible than K8s |
| IaC | Terraform | Multi-cloud, declarative | Pulumi, CDK | State management |
| CI/CD | GitHub Actions | GitHub-native | GitLab CI, CircleCI | Vendor lock-in |
| Observability | OpenTelemetry + Prometheus | Vendor-neutral | Datadog, New Relic | Self-hosted ops |
| CDN | CloudFront | AWS-native | Cloudflare, Fastly | AWS-only |
| Storage | S3 | Durable, cheap | GCS, Azure Blob | AWS-only |
| Secrets | Secrets Manager | Managed rotation | Vault, SSM | Cost per secret |

## 3. Documents Produced
- Technology comparison matrix with scoring
- ADRs for top decisions
- Version pinning document
- PoC results for risky choices

## 4. Architecture Artifacts
- ADR-022: Language + framework choice
- ADR-023: Database technology per service
- ADR-024: Message broker selection
- `docs/stages/B-domain-architecture/11-technology-selection.md`

## 5. Example Deliverables
`docs/stages/B-domain-architecture/11-technology-selection.md` + ADRs for top decisions.

## 6. Key Questions
1. What is the team's existing expertise?
2. What are the non-negotiable requirements? (ordering, replay, multi-region)
3. Which decisions are reversible vs irreversible?
4. What is the PoC scope for risky choices?

## 7. Implementation Tasks
1. Build comparison matrix with weighted scoring per dimension
2. Run PoC for top 3 riskiest choices (broker, database, container orchestration)
3. Document ADR for each technology decision
4. Pin versions for all technologies
5. Validate security posture of chosen technologies (CVE history, update cadence)

## 8. Common Mistakes
- Choosing by hype not requirements
- No PoC for critical choices → surprised by limitations in production
- No version pins → builds break with minor updates
- Not considering operational complexity (Kafka is powerful but operationally heavy)

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| ADR count | ADR for every technology layer |
| PoC completed | Top 3 risky choices validated |
| Version pins | All technologies pinned |
| Team familiarity | Training plan for new technologies |

## 10. Connection to Next Phase
Infrastructure (12) provisions these technologies. Platform Core (13) builds libraries for them.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `11-technology-selection.md`

---

# ═══════════════════════════════════════
# STAGE C — PLATFORM & INFRASTRUCTURE
# ═══════════════════════════════════════

# PHASE 12 — INFRASTRUCTURE DESIGN (IaC)

## 1. Goal
Design all cloud resources, networking, IAM, multi-environment strategy. Security architecture (Phase 05) informs IAM and network security.

## 2. Key Decisions
- VPC topology (public/private subnets, 2+ AZs)
- Managed vs self-hosted data stores
- Environment strategy (dev/staging/prod)

## 3. Documents Produced
- VPC: CIDR, subnets, NAT, security groups
- Compute: ECS tasks per service (CPU, memory, count)
- Data: RDS per service, Redis, Kafka, OpenSearch
- Networking: ALB, CDN, WAF, DNS
- IAM: roles per service (least privilege) — from Phase 05
- Terraform module structure
- Environment matrix (dev/staging/prod differences)
- Cost estimate per environment

## 4. Architecture Artifacts
- ADR-025: VPC topology
- ADR-026: Managed services preference
- `docs/cross-cutting/infrastructure/infrastructure-modules.md`
- `docs/cross-cutting/infrastructure/cost-model.md`

## 5. Example Deliverables
`docs/stages/C-platform-infrastructure/12-infrastructure-design.md`

## 6. Key Questions
1. How many AZs? (minimum 2, prefer 3)
2. Managed or self-hosted? (RDS vs self-managed PostgreSQL)
3. How are environments isolated? (separate VPCs, accounts, namespaces)
4. What is the cost per environment?
5. How are secrets distributed to services?

## 7. Implementation Tasks
1. Design VPC with public/private subnets, NAT gateways, security groups
2. Define compute specs per service (CPU, memory, scaling policy)
3. Define data store configurations per service
4. Create Terraform module structure (modules/vpc, modules/ecs, modules/rds, etc.)
5. Define IAM roles with least-privilege policies
6. Create environment matrix (what differs between dev/staging/prod)
7. Calculate cost estimate per environment

## 8. Common Mistakes
- No private subnets → databases exposed to internet
- Over-sized instances → wasted cost
- No multi-AZ → single point of failure
- No environment parity → "works in staging" fails in prod

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Terraform plan clean | `terraform plan` succeeds with no errors |
| IAM least-privilege | All roles reviewed, no wildcard permissions |
| Multi-AZ | All critical resources span ≥ 2 AZs |
| Cost estimate | Per-environment cost calculated and approved |
| Security groups reviewed | No overly permissive security groups |

## 10. Connection to Next Phase
Platform Core (13) uses this infrastructure. CI/CD (16) deploys to it. DR (24) extends it for failover.

### 🛑 APPROVAL GATE → 🏗️ + 🔒 Combined Review → Review `12-infrastructure-design.md`

---

# PHASE 13 — PLATFORM CORE

## 1. Goal
Build shared libraries (`@app/core`) that ALL services import for consistency.

## 2. Key Decisions
- Monorepo package structure
- DDD folder template for services
- Event envelope schema (implements Phase 09 design)
- Resilience strategies (FAIL_CLOSE, FAIL_OPEN, NON_BLOCKING)

## 3. Documents Produced — Shared Module Catalog

| Module | Purpose |
|--------|---------|
| Logger | Structured JSON, correlation ID |
| HTTP Client | Retry, timeout, circuit breaker (`safeExecute`) |
| Auth | JWT validation, guards, RBAC |
| Database | Base repository, TypeORM config, migrations |
| Outbox | Transactional outbox for event publishing |
| Inbox | Transactional inbox for exactly-once consumption |
| Kafka | Producer/consumer abstractions, DLQ |
| Resilience | `safeExecute(fn, strategy)` wrapper |
| Health | Liveness + readiness probes |
| Config | Env var validation (Zod) |
| Metrics | Prometheus counters, histograms |
| Tracing | OpenTelemetry SDK, spans |
| Errors | Domain exceptions → HTTP status mapping |
| Testing | Factories, mocks, test utilities |

## 4. Architecture Artifacts
- ADR-027: DDD folder structure standard
- ADR-028: Event envelope schema
- ADR-029: Resilience strategies

## 5. Example Deliverables
`docs/stages/C-platform-infrastructure/13-platform-core.md`

## 6. Key Questions
1. What modules do ALL services need?
2. How are core modules versioned?
3. How do teams contribute to core? (inner source)
4. What is the testing standard for core modules?

## 7. Implementation Tasks
1. Set up monorepo package structure (`libs/core/src/`)
2. Implement each core module with unit tests
3. Define DDD folder template for services
4. Create inner source contribution guide
5. Publish module documentation

## 8. Common Mistakes
- Building services before core modules → inconsistent behavior
- Inconsistent logging → impossible to correlate requests
- No shared error handling → every service handles errors differently
- Core modules without tests → breaking changes propagate silently

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Module test coverage | > 80% for all core modules |
| Integration tests pass | All modules tested with real dependencies |
| Module count | All 14 planned modules implemented |
| Documentation | Each module has usage docs |

## 10. Connection to Next Phase
Testing Strategy (14) builds test infrastructure on core. Developer Platform (15) builds tooling around core. Every service imports `@app/core`.

### 🛑 APPROVAL GATE → 🧪 Quality Gate → Review `13-platform-core.md`

---

# PHASE 14 — TESTING STRATEGY ⬆️ MOVED EARLIER

## 1. Goal
Design the complete test architecture: test pyramid, test types, infrastructure, coverage targets. Testing strategy is defined NOW so that Platform Core's testing module (Phase 13) and all subsequent development follows these standards.

## 2. Key Decisions
- Test framework: Jest, Vitest, Mocha?
- Contract testing: Pact or schema validation?
- Load testing: k6, Artillery, Locust?
- Chaos testing: Litmus, manual fault injection?

## 3. Documents Produced — Test Pyramid

```
                 ╱╲
                ╱  ╲         E2E / UI Tests (few, slow, expensive)
               ╱────╲       Browser-based flows, Playwright/Cypress
              ╱      ╲
             ╱────────╲     Contract Tests (event schema + API contract)
            ╱          ╲    Pact or Zod schema validation
           ╱────────────╲
          ╱              ╲   Integration Tests (medium count)
         ╱────────────────╲  Real DB + Kafka + Redis via TestContainers
        ╱                  ╲
       ╱────────────────────╲ Unit Tests (many, fast, cheap)
      ╱                      ╲ Domain logic, handlers, pure functions
     ╱────────────────────────╲
```

| Test Type | What | Tools | Coverage Target | When |
|-----------|------|-------|----------------|------|
| **Unit** | Domain logic, handlers, utilities | Jest | > 80% line coverage | Every PR |
| **Integration** | Service + real DB/Kafka/Redis | Jest + TestContainers | Critical paths | Every PR |
| **Contract** | API contracts + event schemas | Zod validation, OpenAPI lint | 100% of APIs/events | Every PR |
| **Load** | Performance under production load | k6 | p95 < SLO under 2x peak | Pre-release |
| **Chaos** | Resilience under failure conditions | Litmus / manual | All critical paths | Pre-release |
| **E2E** | Full user journeys | Playwright | Critical 5 journeys | Nightly |

## 4. Architecture Artifacts
- ADR-030: Test pyramid ratios (70/20/5/5 unit/integration/contract/E2E)
- ADR-031: TestContainers for integration tests (real dependencies, not mocks)
- `docs/cross-cutting/testing/testing-architecture.md`

## 5. Example Deliverables
`docs/stages/C-platform-infrastructure/14-testing-strategy.md`

## 6. Key Questions
1. Minimum coverage thresholds? (80% unit, critical paths integration)
2. TestContainers or mock databases?
3. Contract testing: pact broker or schema registry?
4. Performance benchmark baselines?
5. Who writes tests? (same engineer, or separate QE?)

## 7. Implementation Tasks
1. Configure test framework (Jest + ts-jest)
2. Set up TestContainers config (PostgreSQL, Redis, Kafka containers)
3. Create test utilities in `@app/core/testing` (factories, mocks, helpers)
4. Define contract test setup (validate Zod event schemas in CI)
5. Write k6 load test scripts (browse, search, checkout scenarios)
6. Define chaos test experiments (kill service, network partition, DB failover)
7. Set up coverage reporting in CI (fail if below threshold)

## 8. Common Mistakes
- Testing only happy paths (no failure / edge cases)
- Mocking everything (tests pass but real integration fails)
- No load testing → discover performance limits in production
- Tests only run locally, not in CI → broken tests merge
- No contract testing → breaking API/event changes merge silently

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Test pyramid ratios defined | 70/20/5/5 documented |
| Coverage thresholds configured | CI fails below threshold |
| Test infra provisioned | TestContainers working |
| k6 scripts ready | At least 3 load test scenarios |
| Contract tests configured | API + event schema validation in CI |

## 10. Connection to Next Phase
Developer Platform (15) includes test setup in service templates. CI/CD (16) runs these tests in pipeline. Vertical Slice (17) is the first real test of this testing strategy.

### 🛑 APPROVAL GATE → 📋 Document Review → Review `14-testing-strategy.md`

---

# PHASE 15 — DEVELOPER PLATFORM / DX

## 1. Goal
Build internal tooling, service templates, local dev environment, and documentation portal so engineers can create and run services with minimal friction.

## 2. Key Decisions
- Service scaffold: CLI generator or template repo?
- Local dev: Docker Compose or Tilt/Skaffold?
- Documentation portal: Backstage, Docusaurus, or static site?

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| Service template | Scaffold new services with DDD structure, Dockerfile, CI, tests |
| Local dev environment | Docker Compose with all dependencies (DB, Redis, Kafka, OpenSearch) |
| Dev workflow guide | How to create, build, test, debug, deploy a service |
| API documentation portal | Auto-generated from OpenAPI specs |
| Onboarding guide | New engineer → first PR in 1 day |
| Inner source guidelines | How to contribute to `@app/core` |

## 4. Architecture Artifacts
- ADR-032: Service template structure
- ADR-033: Local dev strategy (Docker Compose vs K8s-based)

## 5. Example Deliverables
`docs/stages/C-platform-infrastructure/15-developer-platform.md`, `scripts/create-service.sh`, `docker-compose.dev.yml`

## 6. Key Questions
1. How fast can a new engineer create and deploy a service? (target: <1 day)
2. Can all services run locally? Which need mocks?
3. Where is internal documentation hosted?

## 7. Implementation Tasks
1. Create service scaffold script: `./scripts/create-service.sh <name>`
   - Generates: DDD folder structure, Dockerfile, CI workflow, health check, test setup
   - Pre-configures: TypeORM, Kafka, Redis, logging, metrics from `@app/core`
2. Create Docker Compose dev environment (PostgreSQL, Redis, Kafka, OpenSearch, Zipkin)
3. Write dev workflow guide: clone → install → create service → run → test → deploy
4. Set up API docs portal (auto-generated from OpenAPI specs)
5. Write onboarding checklist for new engineers
6. Create inner source contribution guide for `@app/core`

## 8. Common Mistakes
- No local dev environment → engineers only test in staging (slow, flaky)
- No service template → every service set up differently
- No onboarding guide → new engineers take weeks to be productive
- No documentation portal → tribal knowledge only

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Time to first PR | < 1 day for new engineer |
| Local env boot time | < 5 minutes |
| Service scaffold time | < 30 minutes to running service |
| Documentation coverage | All services have docs in portal |

## 10. Connection to Next Phase
CI/CD (16) builds on the service template and testing infrastructure. Vertical Slice (17) uses the local dev environment.

### 🛑 APPROVAL GATE → 🧪 Quality Gate → Review `15-developer-platform.md`

---

# PHASE 16 — CI/CD & RELEASE ENGINEERING 🔀 MERGED

## 1. Goal
Design build, test, deploy, rollback pipeline with environment promotion. Includes release strategy, canary/blue-green deployment, feature flag lifecycle, and rollback criteria.

## 2. Key Decisions
- Deployment: blue/green vs canary vs rolling
- Auto-deploy to staging on merge?
- Manual approval for production?
- Database migrations: pre-deploy (additive) vs post-deploy (cleanup)
- Feature flag system: LaunchDarkly, Unleash, or custom
- Canary criteria: error rate threshold, latency threshold, auto-promote time

## 3. Documents Produced
- **CI pipeline**: lint → typecheck → unit test → build → push image
- **CD pipeline**: staging deploy → integration test → approval → prod deploy
- Docker multi-stage build (builder → runner, non-root)
- Monorepo change detection (only build affected services)
- Rollback procedure with criteria
- Branch protection rules
- **Release strategy**: canary %, staged rollouts, traffic shifting
- **Feature flag lifecycle**: create → enable % → monitor → full rollout → cleanup
- **Rollback triggers**: error rate > X%, latency > SLO, manual trigger

## 4. Architecture Artifacts
- ADR-034: Blue/green deployment
- ADR-035: Migration strategy (pre/post-deploy)
- ADR-036: Feature flag strategy
- `docs/cross-cutting/release/ci-cd-pipeline.md`
- `docs/cross-cutting/release/deployment-flow.md`
- `docs/cross-cutting/release/release-strategy.md`

## 5. Example Deliverables
`docs/stages/C-platform-infrastructure/16-cicd-release-engineering.md`

## 6. Key Questions
1. What is the deployment cadence? (daily, weekly, on-demand)
2. What is the canary criteria for auto-promotion?
3. How long is the bake time after deployment?
4. How are feature flags cleaned up after full rollout?
5. What is the maximum rollback time?

## 7. Implementation Tasks
1. Create CI pipeline (lint → typecheck → unit test → build → push)
2. Create CD pipeline (staging → integration test → approval → prod)
3. Set up Docker multi-stage builds
4. Configure monorepo change detection
5. Define rollback procedure (automated + manual)
6. Set up feature flag system
7. Define canary deployment criteria
8. Define release cadence and communication

## 8. Common Mistakes
- No staging environment → deploying untested code to production
- Manual deploys → slow, error-prone, not reproducible
- Migrations that break rollback → can't roll back safely
- No approval gate → accidental production deploys
- Feature flags never cleaned up → flag spaghetti

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Build time | < 15 minutes |
| Deployment frequency | ≥ daily to staging |
| Rollback success rate | 100% (tested) |
| Feature flag system | Configured and tested |
| Pipeline end-to-end | PR → staging deploy works |

## 10. Connection to Next Phase
Vertical Slice (17) is the first real deployment through this pipeline. Production Readiness (25) validates the full pipeline.

### 🛑 APPROVAL GATE → 🧪 Quality Gate → Review `16-cicd-release-engineering.md`

---

# ═══════════════════════════════════════
# STAGE D — SERVICE DEVELOPMENT
# ═══════════════════════════════════════

# PHASE 17 — VERTICAL SLICE

## 1. Goal
Implement ONE complete E2E flow to validate the entire architecture works before building all services.

## 2. Key Decisions
- Which flow? (highest value, touches most layers)

| System Type | Recommended Slice |
|-------------|-------------------|
| E-commerce | Browse → Cart → Checkout → Payment → Confirmation |
| Payments | Create Account → Add Method → Process Payment → Receipt |
| Ride-hailing | Request → Match Driver → Accept → Track → Pay |
| Social | Register → Create Post → Feed Update → Notification |
| Streaming | Register → Browse → Play → Track History |
| Banking | Open Account → Deposit → Transfer → Statement |

## 3. Documents Produced
- Working E2E flow in staging with full observability
- Test results: unit, integration, contract, E2E
- Deployment log: CI/CD pipeline validated
- Rollback test: verified rollback works

## 4. Architecture Artifacts
`docs/stages/D-service-development/17-vertical-slice.md` + working flow in staging.

## 5. Example Deliverables
Working vertical slice deployed via CI/CD pipeline to staging, with traces visible in observability stack.

## 6. Key Questions
1. Which flow exercises the most architectural components?
2. Does the pipeline deploy correctly?
3. Are traces visible end-to-end?
4. Does rollback work?

## 7. Implementation Tasks
1. Provision infrastructure for slice services
2. Build 2-3 services with core modules
3. Deploy via CI/CD pipeline
4. Run all test types (unit, integration, contract, E2E)
5. Verify distributed traces are visible
6. Test rollback procedure

## 8. Common Mistakes
- Choosing too-simple slice → doesn't validate architecture
- Testing only happy path → problems surface in full build
- Not deploying via CI/CD → "it works locally" syndrome
- Skipping observability verification → blind in production

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| E2E flow passes | All assertions pass in staging |
| Traces visible | End-to-end trace in observability stack |
| Deployed via pipeline | Not manually deployed |
| Rollback tested | Rollback completes in < 5 minutes |
| Tests pass | All test types pass |

## 10. Connection to Next Phase
Full Build (18) builds remaining services using validated patterns.

### 🛑 APPROVAL GATE → 🧪 Quality Gate → Vertical slice works E2E in staging before proceeding.

---

# PHASE 18 — FULL IMPLEMENTATION

## 1. Goal
Build ALL remaining services tier-by-tier.

## 2. Key Decisions
- Team allocation per tier
- Parallel vs sequential builds

## 3. Documents Produced — Build in Tier Order

### Tier 1 — Foundation
```
- [ ] Auth Service (JWT, login, register, refresh, logout)
- [ ] User Service (profile CRUD, address management)
- [ ] Verify: Auth ↔ User integration
```

### Tier 2 — Core Business
```
- [ ] Product Service (CRUD, catalog, categories)
- [ ] Search Service (OpenSearch indexing, full-text + faceted)
- [ ] Cart Service (add/remove/update, Redis-backed)
- [ ] Verify: Product → Search event flow
```

### Tier 3 — Transactions
```
- [ ] Order Service (checkout, saga orchestrator)
- [ ] Payment Service (process/refund, idempotent, gateway)
- [ ] Inventory Service (stock, OCC, reservations)
- [ ] Verify: Checkout saga E2E (success + failure + compensation)
```

### Tier 4 — Support
```
- [ ] Notification Service (email/push/in-app)
- [ ] API Gateway (routing, auth, rate limiting, BFF)
- [ ] Verify: Full E2E (browse → checkout → notification)
```

## 4. Architecture Artifacts
`docs/stages/D-service-development/18-full-implementation.md`, all services running in staging.

## 5. Example Deliverables
All services deployed tier-by-tier with integration tests passing at each tier boundary.

## 6. Key Questions
1. Can tiers be built in parallel?
2. What is the critical path?
3. Which team owns which tier?

## 7. Implementation Tasks
1. Build Tier 1 services → verify integration
2. Build Tier 2 services → verify event flows
3. Build Tier 3 services → verify saga end-to-end
4. Build Tier 4 services → verify full system E2E
5. Run all test suites at each tier boundary

## 8. Common Mistakes
- Building all tiers in parallel → integration issues discovered late
- Skipping tests → "it compiles, ship it"
- Not deploying incrementally → big-bang integration

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Services deployed | All services running in staging |
| Test pass rate | 100% of tests pass |
| Event flows verified | All event flows working |
| Full E2E pass | Complete user journey works |

## 10. Connection to Next Phase
Migration (19) addresses schema/API evolution. Observability (20) instruments all services.

### 🛑 APPROVAL GATE → 🧪 Quality Gate (per tier) → Full E2E must pass.

---

# PHASE 19 — MIGRATION & BACKWARD COMPATIBILITY

## 1. Goal
Design strategies for evolving databases, APIs, and events without breaking existing consumers.

## 2. Key Decisions
- Database migration strategy: expand-and-contract
- API versioning: when to create v2
- Event schema: backward-compatible evolution
- Feature flags for gradual rollout (implements Phase 16 strategy)

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| DB migration playbook | Expand → migrate data → contract (no breaking changes) |
| API deprecation policy | Announce → sunset period (90d) → remove |
| Event versioning rules | Add field (OK), remove (new topic), rename (never) |
| Feature flag strategy | Per-feature flags for gradual rollout and kill switches |
| Data migration scripts | For evolving schemas (add column, backfill, drop old) |
| Backward compat test suite | Verify old clients still work after changes |

## 4. Architecture Artifacts
- ADR-037: Expand-and-contract migration pattern
- ADR-038: API deprecation SLA (90-day sunset)

## 5. Example Deliverables
`docs/stages/D-service-development/19-migration-compatibility.md`

## 6. Key Questions
1. Can old clients still work after deployment?
2. How do we handle data backfill for new columns?
3. How long is the API deprecation window?
4. How do we test backward compatibility in CI?

## 7. Implementation Tasks
1. Document expand-and-contract pattern for DB changes:
   ```
   Step 1: Add new column (nullable) — deploy
   Step 2: Backfill data — migration script
   Step 3: Code uses new column — deploy
   Step 4: Remove old column — deploy (post verification)
   ```
2. Define API deprecation lifecycle: annotate → warn header → sunset date → remove
3. Define event evolution rules (integrated with Phase 09 governance)
4. Set up feature flag system for gradual rollouts (from Phase 16)
5. Add backward compat tests to CI (deploy new code, test with old client)

## 8. Common Mistakes
- Deploying breaking DB changes → application crashes on rollback
- No API deprecation notice → breaking third-party integrations
- Removing event fields without versioning → consumers crash
- No feature flags → all-or-nothing deployments

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Migration playbook tested | Expand-and-contract verified |
| Backward compat tests in CI | Automated in pipeline |
| API deprecation policy approved | 90-day sunset documented |
| Feature flag integration | Working with CI/CD pipeline |

## 10. Connection to Next Phase
Production Readiness (25) verifies migration procedures work. Operations (28) uses these patterns for ongoing changes.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `19-migration-compatibility.md`

---

# ═══════════════════════════════════════
# STAGE E — HARDENING (begins)
# ═══════════════════════════════════════

# PHASE 20 — OBSERVABILITY

## 1. Goal
Instrument all services: structured logs, Prometheus metrics, OpenTelemetry traces, dashboards, alerts, SLO monitoring.

## 2. Key Decisions
- Log format: structured JSON with correlation ID
- Metrics: RED (rate, error, duration) per service
- Tracing: OpenTelemetry auto-instrumentation + custom spans
- Alerting: severity routing (P1→PagerDuty, P3→Slack)
- SLO: error budget tracking with burn rate alerts

## 3. Documents Produced
- Log schema: `{timestamp, level, service, correlationId, message, context}`
- Metrics list: `request_duration_seconds`, `request_total`, `error_total`, per-service custom
- Tracing config: sampling rate, span naming, attribute standards
- Dashboard specs: per-service RED, system overview, business KPIs
- Alert rules: `name | condition | severity | action | runbook`
- SLI/SLO definitions: availability, latency, error rate

## 4. Architecture Artifacts
- `docs/cross-cutting/operations/observability-strategy.md`

## 5. Example Deliverables
`docs/stages/E-hardening/20-observability.md`

## 6. Key Questions
1. What sampling rate for traces? (100% dev, 10% prod)
2. What alert thresholds for each SLO?
3. Who gets paged? (routing rules)
4. What business metrics to track? (orders/min, revenue)

## 7. Implementation Tasks
1. Configure structured logging with correlation ID propagation
2. Set up Prometheus metrics (RED per service)
3. Set up OpenTelemetry tracing
4. Create Grafana dashboards (per-service RED, system overview)
5. Create alert rules with runbook links
6. Define SLI/SLO with error budget tracking
7. Configure alert routing (severity → channel → escalation)

## 8. Common Mistakes
- No correlation ID → impossible to trace cross-service requests
- Dashboards without alerts → pretty but useless
- Metrics without understanding → alert fatigue
- No SLO monitoring → no way to know if system is healthy

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Dashboard coverage | Every service has RED dashboard |
| Alert coverage | Every SLO has alert rule |
| Trace coverage | End-to-end traces visible for all flows |
| Log correlation | All services propagate correlation ID |
| SLO definitions | All SLOs defined with error budgets |

## 10. Connection to Next Phase
Performance (21) uses metrics for profiling. Production Readiness (25) requires dashboards + alerts. Operations (28) uses SLOs for health reviews.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `20-observability.md`

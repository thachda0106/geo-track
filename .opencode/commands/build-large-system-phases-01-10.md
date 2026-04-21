---
description: "Phases 01–10: Discovery & Requirements → Domain & Architecture"
---

# Phases 01–10: Discovery → Domain → Architecture

---

# ═══════════════════════════════════════
# STAGE A — DISCOVERY & REQUIREMENTS
# ═══════════════════════════════════════

# PHASE 01 — PRODUCT DISCOVERY

## 1. Goal
Understand the problem, users, MVP scope, success metrics.

## 2. Key Decisions
- What's MVP vs v2?
- Who are the target users?
- What compliance (PCI-DSS, GDPR, HIPAA)?

## 3. Documents Produced
- Product vision (1-page)
- User personas and journeys (3-5 core journeys)
- MVP scope (in/out list)
- KPI definitions with targets

## 4. Architecture Artifacts
None — inputs for architecture come from Phase 02.

## 5. Example Deliverables
`docs/stages/A-discovery-requirements/01-product-discovery.md` containing vision statement, personas, journeys, KPIs, compliance requirements.

## 6. Key Questions
1. What problem? Who are users? (B2C/B2B/internal)
2. 3-5 core user journeys?
3. Success metrics? (revenue, latency, DAU)
4. Existing systems to integrate?
5. Compliance requirements?
6. Expected scale? Team size?

## 7. Implementation Tasks
1. Stakeholder interviews → compile answers
2. Write vision statement (2-3 sentences)
3. Define personas + journeys (happy + error paths)
4. Define quantified KPIs
5. Create MVP in/out scope list

## 8. Common Mistakes
- Starting with tech before understanding the problem
- No MVP scope → building everything
- Ignoring admin/ops flows

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Vision doc approved | ✅ sign-off by product + eng lead |
| Personas defined | ≥ 3 personas with journeys |
| KPIs quantified | All KPIs have numeric targets |
| MVP scope | In/out list reviewed and approved |

## 10. Connection to Next Phase
Requirements (02) uses journeys and KPIs to define detailed stories and SLOs.

### 🛑 APPROVAL GATE → 📋 Document Review → Review `01-product-discovery.md`

---

# PHASE 02 — REQUIREMENTS & SLOs

## 1. Goal
Document functional requirements (user stories), non-functional requirements, traffic estimation, SLO-driven design.

## 2. Key Decisions
- Availability target (99.9% → 99.99%)
- Consistency model per feature (strong vs eventual)
- Multi-tenant or single-tenant

## 3. Documents Produced
- User stories with acceptance criteria
- NFR matrix: availability, latency (p50/p95/p99), throughput, data volume, consistency, security, scalability, recoverability
- Traffic estimation model (RPS, storage/year, bandwidth)
- SLO → architecture implication mapping
- Initial capacity estimate (compute, storage, network sizing)

## 4. Architecture Artifacts
- ADR-001: Database per service
- ADR-002: Async-first communication

## 5. Example Deliverables
`docs/stages/A-discovery-requirements/02-requirements-slos.md` — stories, NFRs, traffic model, SLOs.

## 6. Key Questions
1. Features for MVP?
2. Availability target?
3. Latency targets (p50/p95/p99)?
4. Peak throughput (orders/sec)?
5. Data volume (users, products, events/year)?
6. Consistency per feature?

## 7. Implementation Tasks
1. Write user stories: `AS A [role] I WANT TO [action] SO THAT [benefit]`
2. Build NFR matrix
3. Back-of-envelope: DAU × actions → RPS per endpoint, storage/year
4. Calculate peak multiplier (10x for Black Friday)
5. Map SLOs → architecture decisions
6. Create initial capacity estimate (translate traffic model to infra sizing)

## 8. Common Mistakes
- No traffic estimation → blind infra sizing
- Missing NFRs → wrong architecture
- Skipping SLOs → no way to validate decisions

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| All stories have acceptance criteria | 100% coverage |
| NFR matrix complete | All 8 dimensions documented |
| Traffic model validated | Reviewed by senior engineer |
| SLO coverage | Every user journey has latency + availability SLO |

## 10. Connection to Next Phase
Risk Analysis (03) identifies technical/business risks from requirements. Domain Design (04) uses business capabilities to find bounded contexts.

### 🛑 APPROVAL GATE → 📋 Document Review → Review `02-requirements-slos.md`

---

# PHASE 03 — RISK ANALYSIS & THREAT MODELING 🆕

## 1. Goal
Identify and prioritize technical, business, and security risks BEFORE architecture decisions are locked. Build a threat model using STRIDE/DREAD. Map compliance requirements to controls.

## 2. Key Decisions
- Risk appetite (acceptable vs mitigated vs avoided)
- Threat modeling methodology (STRIDE, DREAD, Attack Trees)
- Compliance frameworks applicable (PCI-DSS, SOC 2, HIPAA, GDPR)
- Third-party dependency risk assessment

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| Risk register | All identified risks with probability, impact, mitigation strategy |
| STRIDE threat model | Per-component threats: Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation |
| Compliance control mapping | Requirement → control → implementation → evidence |
| Third-party risk matrix | Vendor → SLA → fallback strategy → criticality |
| Technical risk assessment | Scalability cliffs, single-points-of-failure, data loss scenarios |
| FMEA for critical flows | Failure Mode and Effects Analysis for top 5 flows |

## 4. Architecture Artifacts
- ADR-003: Risk mitigation strategies
- `docs/cross-cutting/security/threat-model.md`

## 5. Example Deliverables
`docs/stages/A-discovery-requirements/03-risk-analysis.md`

## 6. Key Questions
1. What are the top 10 technical risks? (scale, complexity, unknowns)
2. What are the top 5 business risks? (market, compliance, team capacity)
3. What happens if payment gateway goes down? (third-party failure)
4. What are the attack surfaces? (public APIs, admin panels, event bus)
5. What data breach would be catastrophic? (PII, payment data)
6. What compliance deadlines exist?

## 7. Implementation Tasks
1. Conduct STRIDE analysis for each service boundary
2. Build risk register: risk → probability (1-5) → impact (1-5) → priority → mitigation → owner
3. Map compliance requirements to concrete controls
4. Assess third-party dependencies: SLA, fallback, vendor lock-in risk
5. Perform FMEA on top 5 critical flows (checkout, payment, auth, data sync, deployment)
6. Identify single-points-of-failure from architecture candidates
7. Define risk review cadence (quarterly re-assessment)

## 8. Common Mistakes
- No risk analysis → surprised by scalability cliffs or compliance violations in production
- Security as afterthought → bolt-on security is 10x more expensive
- Ignoring third-party risk → vendor outage cascades to your system
- No compliance mapping → audit failure delays launch by months

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Risk register complete | All risks scored and triaged |
| STRIDE model coverage | All public-facing components analyzed |
| Compliance controls mapped | 100% of applicable requirements |
| No unmitigated P0 risks | All P0 risks have mitigation plans |
| Third-party fallbacks | All critical vendors have fallback strategy |

## 10. Connection to Next Phase
Domain Design (04) uses risk context for service boundary decisions. Security Architecture (05) expands on threat model. All subsequent phases reference risk register for trade-off decisions.

### 🛑 APPROVAL GATE → 📋 Document Review → Review `03-risk-analysis.md`

---

# ═══════════════════════════════════════
# STAGE B — DOMAIN & ARCHITECTURE
# ═══════════════════════════════════════

# PHASE 04 — DOMAIN DESIGN

## 1. Goal
Identify bounded contexts via Event Storming, define aggregates, entities, value objects, domain events, data ownership.

## 2. Key Decisions
- Service boundary rationale
- Data ownership per context
- Sync vs async per interaction

## 3. Documents Produced
- Event Storming timeline (all domain events)
- Bounded context map with relationships
- Per-context: aggregates, entities, value objects, domain events
- Data ownership matrix (context → database → tables)
- Communication matrix (interaction → sync/async → why)

## 4. Architecture Artifacts
- ADR-004: Service boundaries
- ADR-005: Sync vs async matrix

## 5. Example Deliverables
`docs/stages/B-domain-architecture/04-domain-design.md`

## 6. Key Questions
1. All business events? (UserRegistered, OrderPlaced, PaymentProcessed…)
2. Which data strongly consistent? Which eventual?
3. What aggregate boundaries?
4. Who owns which data?

## 7. Implementation Tasks
1. List ALL domain events on timeline
2. Group events → bounded contexts → services
3. Per context: define aggregates, entities, VOs
4. Map context relationships (upstream/downstream)
5. Create data ownership + communication tables

## 8. Common Mistakes
- Too-small services (nano-services), too-large (distributed monolith)
- Shared databases between services
- Defining services by technical layer not business domain

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| All bounded contexts mapped | 100% business capabilities covered |
| Data ownership assigned | Every entity has exactly one owner |
| Communication matrix complete | Every inter-service interaction classified |
| Domain events cataloged | All business events identified |

## 10. Connection to Next Phase
Security Architecture (05) uses domain boundaries for auth boundaries. Architecture (06) uses contexts for system diagram. Data Architecture (07) designs storage per context.

### 🛑 APPROVAL GATE → 📋 Document Review → Review `04-domain-design.md`

---

# PHASE 05 — SECURITY ARCHITECTURE ⬆️ MOVED EARLIER

## 1. Goal
Security by design — shift left. Design auth, encryption, WAF, compliance BEFORE architecture decisions are finalized. Security informs data models (PII encryption), API design (auth headers), event schemas (PII in events), and infrastructure (WAF, IAM).

## 2. Key Decisions
- Auth: JWT (RS256 vs HS256), token lifetimes (access: 15min, refresh: 7d)
- Password hashing: Argon2id
- RBAC matrix (role × resource × CRUD)
- Encryption: at-rest (AES-256, TDE, SSE-S3), in-transit (TLS 1.3)
- Compliance controls mapped to requirements (from Phase 03)

## 3. Documents Produced
- Auth flow diagrams (register, login, refresh, logout, password reset)
- JWT structure + config
- RBAC matrix
- Token management lifecycle (blacklisting, rotation)
- Encryption strategy
- Input validation strategy (DTOs + Zod schemas)
- WAF rules, security headers (CORS, CSP, HSTS)
- Secrets management + rotation policy
- Audit logging schema
- Compliance control implementation plan (from Phase 03 mapping)

## 4. Architecture Artifacts
- ADR-006: JWT signing + lifetimes
- ADR-007: Password hashing (Argon2id)
- ADR-008: RBAC model
- `docs/cross-cutting/security/security-architecture.md`

## 5. Example Deliverables
`docs/stages/B-domain-architecture/05-security-architecture.md`

## 6. Key Questions
1. What auth model? (JWT, session, OAuth2, OIDC)
2. What RBAC roles and permissions?
3. What encryption at-rest and in-transit?
4. Where is PII stored? How is it encrypted?
5. What audit events must be logged?
6. What WAF rules are needed?

## 7. Implementation Tasks
1. Design auth flows with sequence diagrams
2. Define JWT structure, signing algorithm, lifetimes
3. Build RBAC matrix (role × resource × CRUD)
4. Define encryption strategy per data store
5. Define input validation strategy (DTO + Zod)
6. Configure WAF rules and security headers
7. Design secrets management with rotation schedule
8. Design audit logging schema with retention policy
9. Map compliance controls to implementation

## 8. Common Mistakes
- Security as afterthought → bolt-on security is expensive and incomplete
- Hardcoded secrets → credential leaks
- No WAF → vulnerable to OWASP Top 10
- No audit trail → compliance failure
- RBAC not enforced at API gateway → authorization bypass

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| RBAC matrix complete | All roles × resources defined |
| Auth flows documented | All flows have sequence diagrams |
| Encryption strategy approved | At-rest + in-transit for all data stores |
| Compliance controls mapped | 100% of Phase 03 controls have implementation plan |
| 0 critical vulnerabilities | Architecture review reveals no critical gaps |

## 10. Connection to Next Phase
Architecture (06) implements security patterns. Data Architecture (07) applies PII encryption. API Design (08) follows auth header standards. Infrastructure (12) implements security groups, WAF, IAM. Every subsequent phase follows security design.

### 🛑 APPROVAL GATE → 🔒 Security Review → Review `05-security-architecture.md`

---

# PHASE 06 — HIGH-LEVEL ARCHITECTURE

## 1. Goal
Design system architecture: service interactions, API Gateway, caching layers, resilience patterns. Informed by domain boundaries (04) and security decisions (05).

## 2. Key Decisions
- Monolith-first vs microservices
- API Gateway: custom vs managed
- Communication: REST vs gRPC vs GraphQL
- BFF pattern: per-client vs unified

## 3. Documents Produced
- System architecture diagram (client → CDN → WAF → LB → Gateway → services → data)
- Service catalog (name, responsibility, DB, topics, team owner)
- API Gateway design (routing, auth, rate-limiting, BFF)
- Resilience patterns (circuit breaker, retry, timeout, bulkhead, fallback)
- Caching strategy (CDN → API → query cache with TTLs)

## 4. Architecture Artifacts
- ADR-009: Architecture style
- ADR-010: API Gateway responsibilities
- ADR-011: Caching layers
- `docs/cross-cutting/architecture/system-overview.md`
- `docs/cross-cutting/architecture/architecture-diagrams.md`
- `docs/cross-cutting/architecture/service-catalog.md`

## 5. Example Deliverables
`docs/stages/B-domain-architecture/06-high-level-architecture.md`

## 6. Key Questions
1. Monolith-first or microservices from day 1?
2. API Gateway type? (custom, Kong, AWS API GW)
3. Service mesh needed?
4. Multi-region day 1 or v2?
5. Team topology alignment? (Conway's law)

## 7. Implementation Tasks
1. Draw full architecture from client to data stores
2. Create service catalog with owners, responsibilities, dependencies
3. Design API Gateway with routing rules, auth, rate-limiting
4. Select and document resilience patterns per interaction type
5. Design caching strategy with TTLs and invalidation rules

## 8. Common Mistakes
- No API Gateway → direct service exposure, no centralized auth
- Chaining sync calls (A→B→C→D) → cascading failures
- No resilience patterns → first failure takes down everything
- Service boundaries don't align with team boundaries (Conway's law violation)

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| System diagram approved | Reviewed by architecture review board |
| Service catalog > 90% complete | All known services documented |
| Resilience patterns selected | Every inter-service call has resilience strategy |
| ADRs documented | Key decisions have ADRs |

## 10. Connection to Next Phase
Data Architecture (07) designs storage per service. API Design (08) defines contracts for the services.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `06-high-level-architecture.md` + cross-cutting docs

---

# PHASE 07 — DATA ARCHITECTURE

## 1. Goal
Design data models, storage strategy, data flows, partitioning, backup, and data governance for every service.

## 2. Key Decisions
- SQL vs NoSQL per service
- Normalization level (3NF for writes, denormalized for reads/CQRS)
- Partitioning strategy (range, hash, composite)
- Backup and retention policies
- Data lake / analytics pipeline (if needed)

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| Per-service data models | Tables, columns, types, constraints, indexes |
| Data flow diagrams | How data moves between services (sync + async) |
| Storage type matrix | Service → PostgreSQL / Redis / OpenSearch / S3 |
| Partitioning strategy | Which tables, partition key, growth projection |
| Backup policy | Per-database: frequency, retention, cross-region |
| Data governance | PII classification, data residency, retention rules |

## 4. Architecture Artifacts
- ADR-012: Database technology per service
- ADR-013: CQRS read model strategy
- ADR-014: Data partitioning approach
- `docs/cross-cutting/data/data-architecture.md`

## 5. Example Deliverables
`docs/stages/B-domain-architecture/07-data-architecture.md` with per-service ER diagrams, index strategy, query patterns.

## 6. Key Questions
1. Read/write ratio per service? (high-read → add read replicas/cache)
2. Data growth rate? (storage projection 1yr, 3yr)
3. Hot vs cold data? (archive strategy)
4. Cross-service queries? (CQRS, data duplication, API calls)
5. PII classification? (GDPR: what, where, how long)
6. Analytics/reporting needs? (data warehouse, ETL)

## 7. Implementation Tasks
1. Per service: design ER diagram with tables, columns, types, constraints
2. Define indexes (B-tree for equality, GIN for JSONB, trigram for search)
3. Define partitioning strategy for large tables (orders, events)
4. Design CQRS read models (denormalized views for Search, reporting)
5. Define backup policy: automated daily, PITR, cross-region replication
6. Classify PII data: map fields to GDPR/PCI categories
7. Design connection pooling strategy (PgBouncer / RDS Proxy)

## 8. Common Mistakes
- No indexes → full table scans at scale
- N+1 queries in ORM → add eager loading or batch queries
- No connection pooling → connection exhaustion
- Ignoring data growth → disk full in 6 months
- Cross-service JOINs → violates database-per-service

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| ER diagrams complete | All services have data models |
| Index coverage | Every query pattern has supporting index |
| PII fields classified | 100% of PII identified and labeled |
| Backup policy documented | Per-database backup + retention defined |
| Growth projection | 1yr + 3yr storage estimates calculated |

## 10. Connection to Next Phase
API Design (08) uses data models to define request/response schemas. Event Schema (09) uses data models for event payloads.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `07-data-architecture.md`

---

# PHASE 08 — API DESIGN (CONTRACT-FIRST)

## 1. Goal
Define ALL APIs before writing any implementation code. Contracts are the source of truth.

## 2. Key Decisions
- API style: REST (OpenAPI) vs gRPC (protobuf) vs GraphQL (SDL)
- Versioning: URL path (`/v1/`) vs header (`Accept-Version`)
- Pagination: cursor-based vs offset
- Error format: RFC 7807 (Problem Details)
- Rate limiting headers and policies

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| OpenAPI specs per service | Full REST API contracts (YAML) |
| API style guide | Naming conventions, HTTP methods, status codes |
| Error response standard | `{ type, title, status, detail, instance, errors[] }` |
| Pagination standard | Cursor-based: `{ data[], cursor, hasMore }` |
| API versioning rules | When to bump, backward compat rules |
| API catalog | All endpoints across all services |

## 4. Architecture Artifacts
- ADR-015: REST over gRPC for external APIs (gRPC for internal if needed)
- ADR-016: Cursor-based pagination
- ADR-017: API versioning via URL path
- `docs/cross-cutting/api/api-catalog.md`
- `docs/cross-cutting/api/api-style-guide.md`

## 5. Example Deliverables
`docs/stages/B-domain-architecture/08-api-design.md` + per-service OpenAPI specs in `docs/cross-cutting/api/specs/`

## 6. Key Questions
1. Who consumes these APIs? (web, mobile, third-party)
2. Batch operations needed?
3. Webhook support?
4. API rate limits per client tier?
5. API documentation: Swagger UI, Redoc?

## 7. Implementation Tasks
1. Write OpenAPI spec for EVERY service endpoint
2. Define API style guide (naming: `kebab-case`, plurals for collections)
3. Define error response standard (RFC 7807)
4. Define pagination standard (cursor-based)
5. Define versioning rules (additive = same version, breaking = new version)
6. Generate API catalog from specs
7. Set up API contract validation in CI (lint OpenAPI specs)

## 8. Common Mistakes
- Code-first APIs → inconsistent contracts, missing fields discovered in production
- No versioning → breaking changes break all clients
- Offset pagination → performance degrades at page 1000+
- No error standard → every service returns different error formats
- No rate limiting → abuse and outages

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Endpoint coverage | 100% of endpoints have OpenAPI spec |
| Spec lint pass rate | 100% of specs pass linting |
| Style guide published | Approved and accessible |
| Breaking changes | 0 breaking changes in initial design |

## 10. Connection to Next Phase
Event Schema (09) defines async contracts. System Flows (10) traces requests through these API contracts. Testing (14) uses contracts for contract testing. Migration (19) uses versioning rules.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `08-api-design.md` + OpenAPI specs

---

# PHASE 09 — EVENT SCHEMA & GOVERNANCE

## 1. Goal
Formalize event contracts, topic catalog, schema registry, evolution rules, and governance processes.

## 2. Key Decisions
- Schema registry: Confluent, Apicurio, or embedded Zod
- Event envelope standard (type, schemaVersion, source, correlationId, timestamp, payload)
- Schema evolution rules (backward/forward compatibility)
- Consumer group naming strategy
- Partition key strategy per topic

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| Event envelope schema | TypeScript interface + Zod validation |
| Topic catalog | Topic name, partitions, replication, retention, key, publishers, consumers |
| Event catalog | Every event type with payload schema (versioned) |
| Outbox table DDL | Schema for transactional outbox |
| Inbox table DDL | Schema for transactional inbox (dedup, retry, DLQ) |
| Schema evolution rules | Adding fields OK, removing = major version, renaming = never |
| Governance process | How to propose new events, review, approve, publish |

## 4. Architecture Artifacts
- ADR-018: Event schema versioning (backward-compatible additions only)
- ADR-019: Partition key = aggregate ID (ordering guarantee)
- `docs/cross-cutting/events/event-catalog.md`
- `docs/cross-cutting/events/event-flows.md`

## 5. Example Deliverables
`docs/stages/B-domain-architecture/09-event-schema-governance.md`

## 6. Key Questions
1. Retention period? (7d, 30d, forever)
2. Event replay needed?
3. Ordering guarantees? (per-partition, per-key)
4. Who approves new event schemas? (governance process)

## 7. Implementation Tasks
1. Define event envelope schema (TypeScript + Zod)
2. Create topic catalog table
3. Create event catalog with per-event Zod schemas
4. Design outbox processor: polling 5s, batch 100
5. Design inbox service: dedup by eventId, CAS lock, backoff formula
6. Define DLQ naming (`*.dlq`), alerting, replay runbook
7. Define governance: PR → schema review → event catalog update → deploy

## 8. Common Mistakes
- No schema versioning → breaking consumers silently
- No DLQ → lost events with no recovery
- No idempotency (inbox) → duplicate processing
- No governance → wild-west event creation

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Topic catalog complete | All topics defined with config |
| Event types cataloged | All domain events have schemas |
| Schema validation pass rate | 100% of events validate against schema |
| Governance process approved | Event lifecycle documented |

## 10. Connection to Next Phase
System Flows (10) uses these event contracts in flow diagrams. Technology Selection (11) validates broker choice supports these requirements. Vertical Slice (17) proves one event flow works E2E.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `09-event-schema-governance.md`

---

# PHASE 10 — SYSTEM FLOWS

## 1. Goal
Design ALL 14+ end-to-end system flows before building services. Every flow references API contracts (Phase 08) and event schemas (Phase 09).

## 2. Key Decisions
- Retry boundaries and idempotency points
- Correlation ID propagation strategy
- Failure recovery strategy per flow

## 3. Documents Produced
ALL 14+ flows:
1. **HTTP Request Flow** (client → CDN → WAF → ALB → Gateway → service → DB → response)
2. **Authentication Flow** (register, login, refresh, logout, protected route)
3. **Event Flow** (outbox → Kafka → inbox)
4. **Saga / Distributed Transaction Flow** (checkout with compensation)
5. **Error Handling Flow** (domain, infra, unhandled, Kafka, fatal)
6. **Retry Flow** (HTTP exponential backoff, Kafka inbox retry)
7. **Dead Letter Queue Flow** (maxRetries → DLQ → alert → replay)
8. **Cache Flow** (cache-aside read, event-driven invalidation, stampede prevention)
9. **Search Flow / CQRS** (write to PostgreSQL → event → index in OpenSearch)
10. **File Upload Flow** (presigned URL → S3 → CDN)
11. **Notification Flow** (event → template → dispatch via email/push/in-app)
12. **Payment Flow** (command → gateway → result → saga step)
13. **Deployment Flow** (push → CI → staging → approval → prod → health check)
14. **Observability Flow** (logs → metrics → traces → alerts)

## 4. Architecture Artifacts
- ADR-020: Outbox + Inbox pattern for reliable messaging
- ADR-021: Orchestrated saga for checkout
- `docs/cross-cutting/architecture/system-overview.md` (updated)

## 5. Example Deliverables
`docs/stages/B-domain-architecture/10-system-flows.md` — all 14+ flows with sequence diagrams.

## 6. Key Questions
1. Where is the retry boundary in each flow?
2. What is the failure recovery for each step?
3. Where does auth happen in each flow?
4. How is correlation ID propagated end-to-end?

## 7. Implementation Tasks
1. Document all 14+ flows with sequence/activity diagrams
2. Identify every failure point in every flow
3. Define retry + fallback for each failure point
4. Validate flows against NFRs (Phase 02)
5. Cross-reference with API contracts (Phase 08) and event schemas (Phase 09)

## 8. Common Mistakes
- Building services without understanding full request path
- No DLQ design → lost events, silent failures
- No correlation ID → impossible to trace requests across services
- Flows don't handle the error/edge cases

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Flow count | ≥ 14 documented |
| Failure paths | Every flow has error/retry documented |
| Diagram coverage | Every flow has sequence diagram |
| Cross-reference | All flows reference API specs + event schemas |

## 10. Connection to Next Phase
Technology Selection (11) validates technology supports the flows. Platform Core (13) builds libraries for common flow patterns (outbox, retry, circuit breaker).

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `10-system-flows.md` (most critical design document)

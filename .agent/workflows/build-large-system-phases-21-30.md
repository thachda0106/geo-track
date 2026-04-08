---
description: "Phases 21–30: Hardening → Launch → Operations → Evolution"
---

# Phases 21–30: Harden → Launch → Operate → Evolve

---

# ═══════════════════════════════════════
# STAGE E — HARDENING (continued)
# ═══════════════════════════════════════

# PHASE 21 — PERFORMANCE ENGINEERING

## 1. Goal
Establish latency budgets, profile bottlenecks, create capacity model, optimize critical paths.

## 2. Key Decisions
- Latency budget per hop (total budget split across services)
- Database query performance targets
- Cache hit ratio targets
- Capacity model (cost per 1K RPS)

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| Latency budget | Total p95 budget split: Gateway 10ms + Service 50ms + DB 30ms + Network 10ms = 100ms |
| Performance profiles | Per-service profiling results (CPU, memory, I/O hotspots) |
| Database optimization | Slow query log analysis, index recommendations, query plan reviews |
| Cache optimization | Hit ratio per cache, TTL tuning, stampede prevention verification |
| Capacity model | Cost projection: 1K RPS = $X/month → 10K RPS = $Y/month |
| Benchmark baselines | Per-endpoint p50/p95/p99 under expected and peak load |

## 4. Architecture Artifacts
- ADR-039: Latency budget allocation
- ADR-040: Auto-scaling triggers per service
- `docs/cross-cutting/operations/scaling-strategy.md`
- `docs/cross-cutting/infrastructure/cost-model.md` (updated)

## 5. Example Deliverables
`docs/stages/E-hardening/21-performance-engineering.md`

## 6. Key Questions
1. What is the latency budget per hop?
2. Where is the latency spent? (profiling results)
3. What is the cost per 1K RPS? Can we reduce it?
4. What auto-scaling triggers are optimal?
5. Any N+1 queries or unindexed queries?

## 7. Implementation Tasks
1. Define latency budget breakdown per request path
2. Profile each service under load: CPU flame graph, memory allocation, I/O wait
3. Analyze slow query log: add indexes, rewrite queries, add read replicas
4. Tune cache: measure hit ratios, adjust TTLs, verify stampede prevention
5. Define auto-scaling policies: CPU > 70%, custom metric (queue depth, connection count)
6. Create capacity model: map RPS → infrastructure cost → optimize
7. Run benchmark tests and record baselines per endpoint

## 8. Common Mistakes
- No latency budget → 500ms+ responses discovered in production
- Premature optimization (optimize before profiling)
- Scaling compute without fixing slow queries (throwing money at bad code)
- No capacity model → cost surprises at scale

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| All endpoints meet latency SLO | p95 < target under 2x peak load |
| Capacity model documented | Cost per 1K RPS calculated |
| Slow queries resolved | No query > 100ms under load |
| Cache hit ratio | > 85% for all caches |
| Auto-scaling configured | Policies defined and tested |

## 10. Connection to Next Phase
DR (24) uses capacity model for failover sizing. Production Readiness (25) validates performance under load test.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `21-performance-engineering.md`

---

# PHASE 22 — COMPLIANCE & DATA GOVERNANCE 🆕

## 1. Goal
Validate regulatory compliance, conduct Data Protection Impact Assessment (DPIA), verify data lineage, and ensure all compliance controls from Phase 03 are implemented and evidenced.

## 2. Key Decisions
- DPIA scope and methodology
- Data retention enforcement mechanism
- Consent management approach
- Right-to-erasure implementation (GDPR Article 17)
- Audit evidence collection and storage

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| DPIA report | Data Protection Impact Assessment for all PII processing |
| Data lineage map | Where PII flows: service → DB → event → cache → log → backup |
| Consent management | How user consent is collected, stored, and enforced |
| Right-to-erasure runbook | Step-by-step: identify all PII locations → delete → verify |
| Compliance evidence matrix | Control → implementation → test → evidence |
| Data retention enforcement | Automated cleanup jobs per data type |
| Audit trail verification | All security events logged and queryable |

## 4. Architecture Artifacts
- `docs/cross-cutting/data/data-governance.md`
- `docs/cross-cutting/security/compliance-matrix.md`

## 5. Example Deliverables
`docs/stages/E-hardening/22-compliance-data-governance.md`

## 6. Key Questions
1. Where does PII flow? (every service, cache, log, backup, third-party)
2. Can we delete all PII for a user? (right to erasure)
3. How is consent tracked and enforced?
4. What audit events are logged?
5. What evidence is needed for SOC 2 / PCI-DSS audit?
6. Are data retention policies automated?

## 7. Implementation Tasks
1. Conduct DPIA: map all PII processing activities
2. Build data lineage diagram: PII flow across all services and stores
3. Implement consent management (collect, store, enforce, withdraw)
4. Build right-to-erasure workflow (cross-service PII deletion)
5. Verify compliance controls from Phase 03 are implemented
6. Set up automated data retention cleanup jobs
7. Verify audit trail completeness (all security events logged)
8. Prepare compliance evidence package for auditors

## 8. Common Mistakes
- PII in logs → accidental exposure
- No data lineage → can't find all PII locations for deletion
- No consent tracking → GDPR violation
- Compliance controls not tested → audit failure
- Data retention not automated → manual cleanup forgotten

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| DPIA complete | All PII processing assessed |
| Data lineage mapped | 100% of PII flows documented |
| Right-to-erasure tested | Full deletion verified across all stores |
| Compliance controls | 100% of Phase 03 controls implemented with evidence |
| Audit trail | All security events logged and queryable |
| Retention automation | Cleanup jobs for all data types |

## 10. Connection to Next Phase
Production Readiness (25) includes compliance sign-off as go/no-go gate. Operations (28) maintains compliance posture.

### 🛑 APPROVAL GATE → 🔒 Security Review → Review `22-compliance-data-governance.md`

---

# PHASE 23 — CHAOS ENGINEERING & GAME DAYS 🆕

## 1. Goal
Systematically validate system resilience by injecting failures. Run game days to practice incident response under controlled conditions.

## 2. Key Decisions
- Chaos testing framework: Litmus, Chaos Monkey, Gremlin, or manual
- Blast radius controls (start small, expand)
- Game day frequency and scope
- Steady-state metrics for each experiment

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| Chaos experiment catalog | Experiment → hypothesis → blast radius → steady state → results |
| Game day plan | Scenario, participants, rules of engagement, success criteria |
| Game day report | What happened, what worked, what failed, action items |
| Resilience scorecard | Per-service resilience rating based on chaos results |
| Failure mode catalog | Known failure modes and recovery behavior |

## 4. Architecture Artifacts
- `docs/stages/E-hardening/23-chaos-engineering.md`

## 5. Example Deliverables

### Chaos Experiments
| # | Experiment | Hypothesis | Result |
|---|-----------|------------|--------|
| 1 | Kill one service instance | ALB routes to healthy instance, no errors | ☐ |
| 2 | Database failover | RDS Multi-AZ promotes standby, < 30s downtime | ☐ |
| 3 | Kafka broker failure | Consumers reconnect, no message loss | ☐ |
| 4 | Redis failure | Cache miss → DB query, latency increases but no errors | ☐ |
| 5 | Network partition (service A ↔ B) | Circuit breaker opens, fallback response | ☐ |
| 6 | Disk full on service | Health check fails, ECS replaces task | ☐ |
| 7 | Spike traffic (10x) | Auto-scaling triggers, p95 stays within SLO | ☐ |
| 8 | Slow database queries | Timeout kicks in, circuit breaker protects upstream | ☐ |
| 9 | Certificate expiry | Alert fires before expiry, rotation works | ☐ |
| 10 | DNS failure | Fallback DNS, graceful degradation | ☐ |

### Game Day Template
```
GAME DAY: [Scenario Name]
Date: YYYY-MM-DD
Duration: 2 hours
Participants: [Team members]
Scenario: [What failure will be simulated]
Blast Radius: [Staging only / Prod with blast radius controls]
Success Criteria: [What must be true for success]
Steady State: [Normal metrics to compare against]
Runbook to test: [Link to runbook]
```

## 6. Key Questions
1. What are the top 10 most likely failure modes?
2. What is the blast radius of each experiment?
3. Can we run chaos in production or staging only?
4. Does the team know how to respond to each failure?
5. What manual interventions are needed vs automatic recovery?

## 7. Implementation Tasks
1. Define steady-state metrics for each chaos experiment
2. Start with simple experiments (kill instance, fail health check)
3. Progressively increase blast radius (network partition, multi-service failure)
4. Plan and execute first game day (staging)
5. Document results and create action items
6. Build resilience scorecard (per-service ratings)
7. Establish game day cadence (quarterly)

## 8. Common Mistakes
- Running chaos without steady-state definition → can't measure impact
- Starting too big → cascading failure in production
- No game day → first real incident is uncontrolled chaos
- Not fixing issues found → chaos testing becomes theater
- No blast radius controls → experiment damages production

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Experiments completed | ≥ 10 chaos experiments run |
| Pass rate | ≥ 80% of experiments pass |
| Game day completed | ≥ 1 game day executed |
| Action items | All critical findings have remediation plan |
| Resilience scorecard | All services rated |

## 10. Connection to Next Phase
DR (24) builds on chaos experiment results. Production Readiness (25) includes chaos test results as go/no-go criterion.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `23-chaos-engineering.md`

---

# PHASE 24 — MULTI-REGION & DISASTER RECOVERY

## 1. Goal
Design failover, data replication, backup strategy, and DR drills with quantified RTO/RPO.

## 2. Key Decisions
- Multi-region: active-active vs active-passive
- Data replication: async (RPO > 0) vs sync (RPO = 0)
- Backup: frequency, retention, cross-region copy
- Failover: automatic vs manual

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| RTO/RPO matrix | Per-component recovery targets |
| Backup policy | Per-database: frequency, retention, cross-region |
| Failover procedure | Step-by-step with DNS cutover |
| Data replication design | RDS cross-region read replica, Redis replication, Kafka MirrorMaker |
| DR drill procedure | Quarterly drill: simulate region failure, measure actual RTO |
| Business continuity plan | Which features degrade, which go offline during DR |

Example RTO/RPO matrix:
| Component | RPO | RTO | Strategy |
|-----------|-----|-----|----------|
| PostgreSQL (orders) | < 1 min | < 5 min | Multi-AZ + cross-region async replica |
| PostgreSQL (products) | < 1 hour | < 15 min | Automated daily backup + PITR |
| Redis (sessions) | Acceptable loss | < 2 min | Cluster failover + user re-auth |
| Kafka (events) | 0 (replay) | < 10 min | Multi-AZ broker, 3x replication |
| OpenSearch (search) | Rebuildable | < 30 min | Rebuild from source events |

## 4. Architecture Artifacts
- ADR-041: Active-passive DR (v1), active-active (v2)
- ADR-042: Backup and replication strategy
- `docs/cross-cutting/operations/dr-strategy.md`

## 5. Example Deliverables
`docs/stages/E-hardening/24-multi-region-dr.md`

## 6. Key Questions
1. What is acceptable data loss per component? (RPO)
2. How fast must recovery happen? (RTO)
3. Multi-region day 1 or v2?
4. What features can degrade during DR?
5. How often are DR drills conducted?

## 7. Implementation Tasks
1. Define RTO/RPO per component
2. Configure cross-region replication (RDS, Redis)
3. Set up automated backups with cross-region copy
4. Create step-by-step failover runbook
5. Conduct DR drill: simulate region failure, measure actual RTO
6. Document business continuity plan (graceful degradation)
7. Establish quarterly DR drill cadence

## 8. Common Mistakes
- No backups → data loss is permanent
- No DR drill → untested failover that doesn't work
- Single-AZ → regional outage takes down everything
- No graceful degradation → all-or-nothing failure

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Backup restore tested | All databases successfully restored |
| Failover tested | Actual RTO measured ≤ target RTO |
| DR drill completed | ≥ 1 drill executed |
| RPO validated | Replication lag within RPO target |
| Business continuity plan | Degradation mapping documented |

## 10. Connection to Next Phase
Production Readiness (25) includes DR drill as go/no-go gate.

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review `24-multi-region-dr.md`

---

# PHASE 25 — PRODUCTION READINESS

## 1. Goal
Go/no-go gate. Every item must be GREEN before launch.

## 2. Key Decisions
- Load test target (2x or 5x peak?)
- Who signs off? (Engineering lead + Product + SRE)

## 3. Documents Produced — Production Checklist

| Category | Item | ☐ |
|----------|------|---|
| **Health** | All services health-checked + registered in ALB | |
| **Alerts** | SLO alerts configured for every service | |
| **Alerts** | PagerDuty routing configured | |
| **Dashboards** | Per-service RED dashboard | |
| **Dashboards** | System overview dashboard | |
| **Runbooks** | Runbook for every P1/P2 alert | |
| **Load Test** | Passed at 2x peak, p95 < SLO | |
| **Security** | Zero critical/high vulnerabilities | |
| **Security** | WAF rules active, secrets rotated | |
| **Compliance** | DPIA complete, audit trail verified 🆕 | |
| **Compliance** | Data governance controls operational 🆕 | |
| **Chaos** | Chaos experiments pass (≥80%) 🆕 | |
| **Chaos** | Game day completed 🆕 | |
| **DR** | Backup restore tested | |
| **DR** | Failover procedure tested | |
| **Rollback** | Rollback procedure tested | |
| **CI/CD** | Pipeline deploys to staging successfully | |
| **Feature Flags** | Feature flag system operational 🆕 | |
| **Logging** | Structured logs flowing | |
| **Tracing** | Distributed traces visible | |
| **Migration** | Expand-and-contract tested | |
| **API** | OpenAPI specs up-to-date | |
| **Docs** | Onboarding guide complete | |
| **On-call** | On-call rotation configured 🆕 | |

## 4. Architecture Artifacts
- `docs/stages/E-hardening/25-production-readiness.md`
- `docs/cross-cutting/operations/runbooks/` (individual runbooks)

## 5. Example Deliverables
Production readiness checklist with all items GREEN.

## 6. Key Questions
1. Is every checklist item GREEN?
2. Who is on-call for launch?
3. What is the rollback criterion?
4. What is the escalation path?

## 7. Implementation Tasks
1. Verify every checklist item
2. Run final load test (2x peak)
3. Run final security scan
4. Conduct final DR drill (if not done recently)
5. Verify chaos experiment results
6. Confirm compliance readiness
7. Get sign-off from all approvers

## 8. Common Mistakes
- No load test → discover limits in production
- No runbooks → panic during incidents
- No DR drill → untested recovery
- Skipping compliance → blocked by legal
- Not verifying on-call setup → no one responds to alerts

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Checklist completion | 100% items GREEN |
| Load test | Passed at 2x peak |
| Security scan | 0 critical/high vulnerabilities |
| Approver sign-off | Eng Lead + Product + SRE |

## 10. Connection to Next Phase
Deployment (26) launches to production after ALL items GREEN.

### 🛑 APPROVAL GATE → 🚀 Launch Gate → GO/NO-GO. All items must be GREEN.

---

# ═══════════════════════════════════════
# STAGE F — LAUNCH
# ═══════════════════════════════════════

# PHASE 26 — DEPLOYMENT

## 1. Goal
Zero-downtime production launch with verified rollback.

## 2. Key Decisions
- DNS cutover: weighted vs instant
- War room during deployment?
- Feature flags for gradual rollout?
- Canary percentage and promotion criteria

## 3. Documents Produced
- Deployment runbook (step-by-step with rollback at each step)
- Post-deploy verification (health, smoke tests, dashboards)

## 4. Implementation Tasks
```
1. Pre-deploy: staging green, checklist green, team notified
2. Terraform apply (production)
3. Deploy services tier-by-tier (blue/green or canary)
4. Run DB migrations (pre-deploy: additive only)
5. DNS cutover (Route53 → production ALB)
6. Smoke test all critical paths
7. Monitor 2 hours (error rate, latency)
8. Rollback trigger: error > 1% → auto-rollback
```

## 5. Example Deliverables
`docs/stages/F-launch/26-deployment.md`

## 6. Key Questions
1. Feature flags on or off for launch?
2. What is the canary percentage schedule? (1% → 10% → 50% → 100%)
3. Who is in the war room?
4. What is the rollback decision time? (< 5 minutes)

## 7. Common Mistakes
- Big-bang deploy → no rollback path
- No rollback plan → stuck with broken production
- No monitoring during deploy → blind to problems
- Not using feature flags → can't kill problematic features

## 8. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Downtime | 0 (zero-downtime deploy) |
| Error rate | < 0.1% for 2 hours post-deploy |
| Smoke tests | All critical paths pass |
| Rollback verified | Rollback tested and completes < 5 min |

## 9. Connection to Next Phase
Stabilization (27) begins immediately after successful deployment.

### 🛑 APPROVAL GATE → 🚀 Launch Gate → System healthy for 2 hours. Launch confirmed.

---

# PHASE 27 — POST-LAUNCH STABILIZATION 🆕

## 1. Goal
Dedicated 2-week stabilization period with specific exit criteria. Ensure system is stable before entering normal operations mode.

## 2. Key Decisions
- Stabilization period length (1-2 weeks)
- Enhanced monitoring thresholds during stabilization
- Escalation paths during stabilization
- Feature freeze during stabilization?

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| Stabilization plan | Daily checklist, enhanced monitoring, escalation paths |
| Daily stability report | Error rate, latency, incidents, user feedback |
| Bug triage log | All bugs found, severity, fix status |
| Error budget baseline | Initial SLO attainment measurements |
| Performance baseline | P50/P95/P99 baselines from real traffic |

## 4. Architecture Artifacts
`docs/stages/F-launch/27-post-launch-stabilization.md`

## 5. Example Deliverables

### Daily Stabilization Checklist
```
☐ Review error rates (< 0.1%)
☐ Review latency percentiles (p95 < SLO)
☐ Review alert volume (decreasing trend)
☐ Review user feedback/support tickets
☐ Triage new bugs (P1 → fix immediately, P2 → fix this week)
☐ Review capacity utilization (< 70% CPU)
☐ Stand-up focused on production health
```

### Stabilization Exit Criteria
```
☐ Error rate < 0.1% for 7 consecutive days
☐ No P1 incidents in last 5 days
☐ All P1/P2 bugs resolved
☐ SLO attainment > 99.9% for 7 days
☐ Alert volume decreasing trend
☐ On-call rotation tested (at least 1 rotation)
☐ No manual interventions needed for 3 days
```

## 6. Key Questions
1. Is the error rate trending down?
2. Are there any unresolved P1/P2 bugs?
3. Is the on-call team comfortable with the system?
4. Are there any capacity concerns?
5. Is user feedback positive?

## 7. Implementation Tasks
1. Set up enhanced monitoring dashboards for stabilization
2. Daily stability stand-ups (production-focused)
3. Fix all P1/P2 bugs as they're discovered
4. Establish error budget baseline from real traffic
5. Record performance baselines (p50/p95/p99) from production
6. Test on-call rotation with real alerts
7. Document any hotfixes and their root causes

## 8. Common Mistakes
- Declaring "done" after deployment without stabilization
- Not fixing P2 bugs during stabilization → they become P1 in production
- No error budget baseline → can't track SLO degradation
- Feature work during stabilization → distracts from bugs
- No daily stand-ups → problems go unnoticed

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Error rate | < 0.1% for 7 consecutive days |
| P1 incidents | 0 in last 5 days |
| P1/P2 bugs | All resolved |
| SLO attainment | > 99.9% for 7 days |
| On-call rotation | At least 1 rotation completed |

## 10. Connection to Next Phase
Operations (28) begins when stabilization exit criteria are met.

### 🛑 APPROVAL GATE → 📋 Document Review → Stabilization exit criteria met.

---

# ═══════════════════════════════════════
# STAGE G — OPERATIONS
# ═══════════════════════════════════════

# PHASE 28 — OPERATIONS & INCIDENT MANAGEMENT

## 1. Goal
Establish on-call rotation, incident management, post-mortem process, SLO reviews.

## 2. Key Decisions
- On-call rotation (2-person minimum)
- Incident severity: P1 (revenue), P2 (degraded), P3 (minor), P4 (cosmetic)
- Post-mortem: blameless, within 48 hours for P1/P2
- SLO review cadence (weekly)

## 3. Documents Produced
- On-call rotation and escalation matrix
- Incident management process: detect → triage → diagnose → resolve → communicate → review
- Post-mortem template: timeline, root cause, 5 whys, action items, prevention
- Weekly SLO review template
- Monthly capacity review template
- Communication template (incident updates for stakeholders)

## 4. Architecture Artifacts
- `docs/stages/G-operations/28-operations-incident-mgmt.md`
- `docs/cross-cutting/operations/incident-templates/`

## 5. Example Deliverables

### Incident Severity Matrix
| Severity | Definition | Response Time | Communication | Post-Mortem |
|----------|-----------|---------------|---------------|-------------|
| P1 | Revenue impact / data loss | < 15 min | Every 30 min to stakeholders | Required, within 48h |
| P2 | Feature degraded | < 30 min | Every 1 hour | Required, within 72h |
| P3 | Minor issue, workaround exists | < 4 hours | Internal only | Optional |
| P4 | Cosmetic / low impact | < 1 business day | None | Not required |

### Post-Mortem Template
```
# Post-Mortem: [Incident Title]
Date: YYYY-MM-DD
Duration: X hours
Severity: P1/P2
Impact: [Users/revenue affected]
## Timeline
## Root Cause (5 Whys)
## What Went Well
## What Went Wrong
## Action Items (with owners and due dates)
## Prevention Measures
```

## 6. Key Questions
1. Who is on-call? What is the rotation schedule?
2. What is the escalation path for each severity?
3. How quickly do we communicate to stakeholders?
4. What is the post-mortem process?
5. How do we track action items from post-mortems?

## 7. Implementation Tasks
1. Set up on-call rotation (PagerDuty / OpsGenie)
2. Define incident management process
3. Create post-mortem template and review process
4. Create stakeholder communication templates
5. Set up weekly SLO review meeting
6. Set up monthly capacity review
7. Create incident tracking dashboard

## 8. Common Mistakes
- No on-call rotation → single point of failure
- No post-mortems → repeat the same mistakes
- No SLO tracking → don't know if system is healthy
- Blame culture in post-mortems → people hide problems
- No incident communication → stakeholders surprised

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| On-call configured | Rotation active with ≥ 2 people |
| MTTD (Mean Time to Detect) | < 5 minutes for P1 |
| MTTR (Mean Time to Resolve) | < 1 hour for P1 |
| Post-mortem completion | 100% for P1/P2 |
| SLO review cadence | Weekly reviews conducted |

## 10. Connection to Next Phase
SLO Review (29) uses operational data for optimization. Evolution (30) uses operational data for planning.

### 🛑 APPROVAL GATE → 📋 Document Review → Operations processes verified.

---

# PHASE 29 — SLO REVIEW & OPTIMIZATION 🆕

## 1. Goal
Data-driven optimization cycle: review SLO attainment, identify degradation trends, optimize based on production data.

## 2. Key Decisions
- SLO review cadence (weekly for first month, then bi-weekly)
- Error budget policy (what happens when error budget is exhausted?)
- Optimization prioritization (SLO impact × effort)

## 3. Documents Produced
| Artifact | Description |
|----------|-------------|
| SLO attainment report | Per-SLO: target vs actual, error budget remaining |
| Error budget policy | Exhausted → feature freeze until SLO restored |
| Optimization backlog | Identified improvements ranked by SLO impact |
| Trend analysis | Latency/error trends over time |
| Capacity forecast | When will current capacity be insufficient? |

## 4. Architecture Artifacts
`docs/stages/G-operations/29-slo-review-optimization.md`

## 5. Example Deliverables

### SLO Attainment Report Template
| SLO | Target | Actual (30d) | Error Budget | Status |
|-----|--------|-------------|--------------|--------|
| Availability | 99.9% | 99.95% | 50% remaining | 🟢 |
| Latency (p95) | < 200ms | 145ms | N/A | 🟢 |
| Error Rate | < 0.1% | 0.05% | 50% remaining | 🟢 |
| Checkout Success | > 99% | 98.5% | Exhausted | 🔴 |

### Error Budget Policy
```
IF error_budget > 50% remaining → Normal development, ship features
IF error_budget 25-50% remaining → Increased caution, extra testing
IF error_budget < 25% remaining → Slow down, prioritize reliability
IF error_budget exhausted → Feature freeze, fix reliability first
```

## 6. Key Questions
1. Which SLOs are at risk?
2. What is the error budget burn rate?
3. What is the leading indicator of SLO degradation?
4. What optimizations have the highest SLO impact?
5. When will capacity need to increase?

## 7. Implementation Tasks
1. Set up automated SLO attainment reporting
2. Define error budget policy
3. Conduct first SLO review meeting
4. Identify optimization opportunities from production data
5. Create optimization backlog ranked by SLO impact / effort
6. Establish capacity forecasting process
7. Document SLO review process for ongoing cadence

## 8. Common Mistakes
- No SLO tracking → no way to know if system is healthy
- No error budget policy → SLOs are just dashboards, not actionable
- Optimizing without data → premature optimization
- No capacity forecasting → surprised by traffic growth
- SLO reviews without action items → review theater

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| SLO review cadence | Weekly for first month |
| Error budget policy | Documented and approved |
| Optimization backlog | ≥ 5 items prioritized |
| All SLOs green | No SLOs in error budget exhausted state |
| Capacity forecast | 6-month forecast documented |

## 10. Connection to Next Phase
Evolution (30) uses SLO data and optimization backlog for architecture evolution planning.

### 🛑 APPROVAL GATE → 📋 Document Review → SLO review process established.

---

# ═══════════════════════════════════════
# STAGE H — EVOLUTION
# ═══════════════════════════════════════

# PHASE 30 — SYSTEM EVOLUTION & FINOPS

## 1. Goal
Long-term system health: technical debt, cost optimization (FinOps), architecture evolution, v2 planning.

## 2. Key Decisions
- FinOps: reserved instances vs on-demand vs spot
- Tech debt: prioritize by impact/effort ratio
- Architecture evolution: when to add regions, split services, adopt new tech

## 3. Documents Produced

### FinOps / Cost Optimization
| Area | Action |
|------|--------|
| Compute | Right-size ECS tasks based on actual utilization (not estimated peak) |
| Database | Reserved instances for baseline, read replicas only where measured |
| Storage | S3 lifecycle policies (Standard → IA → Glacier) |
| Network | Optimize cross-AZ traffic, VPC endpoints for AWS services |
| CDN | Cache optimization (hit ratio > 90%) |
| Monitoring | Per-service cost allocation tags |

### Technical Debt Backlog
| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P0 | Fix known race conditions | Data integrity | 2 days |
| P1 | Missing integration tests | Confidence | 1 week |
| P1 | Upgrade framework version | Security patches | 3 days |
| P2 | Refactor shared module deps | Build speed | 1 week |
| P3 | Improve error messages | DX | 2 days |

### Architecture Evolution Roadmap
| Version | Change | Trigger |
|---------|--------|---------|
| v1.1 | Read replicas for hot services | Query latency > 200ms |
| v1.2 | CDN & cache optimization | Hit ratio < 80% |
| v2.0 | Service decomposition | Service > 50K LOC |
| v2.1 | Multi-region deployment | Latency > 200ms for remote users |
| v3.0 | Event sourcing (audit-critical) | Compliance requirement |
| v3.1 | GraphQL federation | Mobile app optimization |

## 4. Architecture Artifacts
- `docs/cross-cutting/finops/finops-report.md`
- ADR-043: Cost optimization decisions

## 5. Example Deliverables
`docs/stages/H-evolution/30-system-evolution-finops.md`

## 6. Key Questions
1. What are the top 10 performance bottlenecks? (from production metrics)
2. Total cloud spend? Per-service breakdown? Optimization opportunities?
3. What tech debt was accumulated? Priority by impact/effort?
4. What v2 features are most requested?
5. Should any services be split, merged, or rewritten?

## 7. Implementation Tasks
1. Monthly FinOps review: per-service cost → optimization recommendations
2. Quarterly architecture review: what's working, what's not, what to change
3. Maintain tech debt backlog (prioritized)
4. Create evolution roadmap (v1.x → v2.x → v3.x with triggers)
5. Dependency updates: monthly minor, quarterly major
6. Plan team growth based on system complexity

## 8. Common Mistakes
- Never paying tech debt ("later" = never)
- No cost monitoring (cloud bill shock at scale)
- Rewriting working services without business justification
- Over-engineering v2 before v1 is stable
- No architecture reviews → system drifts from design

## 9. KPIs & Exit Criteria
| KPI | Target |
|-----|--------|
| Monthly FinOps review | Conducted with action items |
| Cost optimization | ≥ 10% cost reduction identified |
| Tech debt backlog | Maintained and reviewed quarterly |
| Evolution roadmap | v1.x → v2.x documented |
| Dependency updates | Monthly minor, quarterly major |

## 10. Connection to Next Phase — The Cycle
Evolution feeds back into Discovery. The cycle continues:
```
Operate (28) → Review (29) → Evolve (30) → Discover (01) → Requirements (02) → ...
```

### 🛑 FINAL REVIEW → System is in production and evolving. Engineering handbook is complete.

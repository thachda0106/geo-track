# Phase 09 — Deploy, Stabilize & Evolve
# "Ship to production, stabilize, and evolve"

## 🎯 Goal
Ship GeoTrack to production, enforce a stability period to establish an error budget baseline, document standard incident practices, and lay out an active Tech Debt roadmap for future iterations.

---

## 1. Deployment Runbook

Executing a production release requires zero-downtime maneuvers.

### A. Pre-Flight Checklist
1. **CI Pipeline Pass**: Confirm that GitHub Actions shows a full green state for unit, integration, and E2E test suites on the `main` branch.
2. **SAST Scan Pass**: Validate that no critical vulnerabilities were introduced (Snyk / `npm audit`).
3. **Database Pre-Check**: Ensure Postgres is alive and connection pools are healthy (`< 60% capacity`).

### B. Deployment Sequence
1. **Run Migrations**: Execute `npx prisma migrate deploy` targeting the production db URL. Since Prisma `deploy` checks the state against `.sql` migrations cleanly, this guarantees tables are aligned before app code shifts.
2. **Blue-Green Switch**: Start new Docker swarm pods pointing to the updated tag (`geotrack:latest`). Wait for `GET /health/liveness` to return `200 OK` across all new containers.
3. **Traffic Shift**: Route NGINX/ALB weight fully (100%) to the new pods.
4. **Drain**: Gracefully terminate previous containers (`SIGTERM`), allowing active requests (up to `30s`) to drain fully.

### C. Rollback Strategy
If `GET /health/liveness` fails or immediate 5xx baseline spikes > 2% within 5 minutes:
1. Immediately revert traffic weights back to prior active pods.
2. Avoid reversing database transactions automatically; instead, run documented safe compensating SQL fixes manually if destructive table changes occurred.

---

## 2. Stabilization Protocol (Weeks 1 & 2)

The moment the system boots in `production` for the first time, rule sets lock into place:
- **No New Features**: The primary directive is monitoring for at least 14 days. Feature merges strictly paused.
- **Set Error Baselines**: Daily checks mapping real usage traffic back to our NFR estimates.
- **Fast Patching**: Only P1 and P2 bugs (Critical regressions / Data loss) will be diagnosed, resolved, and hot-fixed out of band.

---

## 3. Incident Response Process

When an alarm triggers (as specified in `08-observability-hardening.md`), we follow the **D.T.M.R.P.** pipeline:

1. **Detect**: Alert fires to PagerDuty/Jira via Grafana alerting rules.
2. **Triage**: Engineer acknowledges the page within 5 minutes, validates system impact (P1 vs P3), and restricts bleeding (e.g. throttling offending IPs or restricting specific module ingest).
3. **Mitigate**: Apply temporary fixes to stop the bleeding—often triggering the Rollback sequence, flushing Redis arrays, or restarting pods.
4. **Resolve**: Develop a permanent root-cause fix via PR and integration test inclusion.
5. **Post-Mortem**: Document blameless circumstances using the standard template.

### Post-Mortem Template

> **Incident Name:** [Brief Title]
> **Date:** [YYYY-MM-DD]
> **Authors:** [Responder Names]
> 
> **1. Summary:** 
> What happened and what was the customer impact?
> 
> **2. Timeline:**
> - *08:00 UTC* - System monitored initial 5xx spike pointing to Geometry context.
> - *08:05 UTC* - Alarm dispatched to on-call.
> 
> **3. Root Cause:** 
> Why did this occur structurally (the '5 Whys')?
> 
> **4. Resolution Strategy:**
> How was it fixed?
> 
> **5. Action Items:**
> How do we ensure this exact incident never repeats? (e.g. Include specific unit test capturing the boundary flaw).

---

## 4. Evolution & Tech Debt Backlog

Following stabilization, GeoTrack moves into an iterative evolution lifecycle (v2+).

### Priority Tech Debt List
1. **TimescaleDB Infrastructure Migration**: As established previously, raw SQL initialization was used as an MVP workaround for `tracking.location_points`. *Goal: Seamlessly bridge TimescaleDB officially onto a dedicated persistence module out-of-bounds of standard Prisma relations.*
2. **Redis Outbox Resilience**: Currently the Inbox/Outbox polling relays via simple `@Cron`. *Goal: Convert `@Cron` tasks to more reliable long-polling architectures native to Redis Streams (`XREADGROUP`) to scale relay workers horizontally.*
3. **Delineating Auth Service Boundaries**: Move `auth/identity` into an isolated physical microservice instance once Monolithic limits hit the bounded context peak.

### Future Feature Roadmap
Reflecting on the OUT scope elements from Phase 1:
- [ ] Offline tracking synching protocols via MQTT.
- [ ] Automated Geofencing bounding box calculations and triggered notification systems via WebSocket sockets.
- [ ] Archival spatial queries targeting AWS S3 (Cold Storage of tracks > 6 months old).

---

## 📤 Output (Artifact)
We've successfully established a sustainable loop for GeoTrack. We not only know how to build it perfectly, but precisely how to deploy, react to it breaking, and intelligently plan our technical next steps.

## ✅ Done Criteria
- [x] Pre-flight, Deployment, and Rollback checklists defined.
- [x] Initial 2-week Stabilization boundary rules documented.
- [x] Blameless Post-Mortem structure prepared.
- [x] Actionable feature/Tech Debt evolutionary backlog written.

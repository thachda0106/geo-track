# Phase 08 — Observability & Hardening
# "Make it visible and resilient"

## 🎯 Goal
Implement telemetry (logs, metrics, traces), dashboards, alerting, and finalize production readiness so you can operate the GeoTrack system blindfolded.

## 📥 Input
- Working system & comprehensive test suite (Phase 7).
- NFRs from Phase 1 (e.g., 99.9% availability, sub-second latency for tracking data ingestion).

## ⚙️ What to Do

### 1. Observability Strategy

**Telemetry Stack: Grafana LGTM (Loki, Grafana, Tempo, Mimir)**

- **Logs (Loki):**
  - Built upon our existing `@app/core` logger (`pino-http`).
  - **Structured JSON with mandatory correlation IDs** (`requestId` or `eventId`). Let Loki handle the scalable ingestion.
  - **Log Levels:**
    - `ERROR`: Alertable errors disrupting user flow or system integrity.
    - `WARN`: Domain exceptions (like duplicates) or retries that shouldn't wake you up but need visibility.
    - `INFO`: Business lifecycle milestones (User created, Feature modified).
    - `DEBUG`: Tracing logic flow (disabled in production unless isolated to a debug session).
    
- **Metrics (Mimir / Prometheus):**
  - **API Metrics (RED)**: We use NestJS `@willsoto/nestjs-prometheus` to automatically gather:
    - **R**ate: HTTP requests per second.
    - **E**rrors: HTTP 4xx and 5xx rates.
    - **D**uration: p50, p95, and p99 request latencies.
  - **Infrastructure Metrics (USE)**: Track PostgreSQL, Redis, and Node.js process pools:
    - **U**tilization: CPU%, Memory usage%, Connection Pool %.
    - **S**aturation: Event loop lag, Redis queue depth.
    - **E**rrors: Dropped connections or OOM kills.

- **Traces (Tempo / OpenTelemetry):**
  - Implement `@opentelemetry/api` across service and module boundaries.
  - Automatic propagation of trace contexts in HTTP Headers.
  - Span decorations for **Prisma queries**, enabling visualization of exactly how long specific raw spatial SQL executions take.

### 2. Dashboard Design

We maintain three primary Grafana dashboards:

1. **Executive Dashboard (SLO Compliance & Business Metrics)**: 
   - Active users, tracking sessions alive, tracking points ingested last 24h.
   - Availability SLO (target: 99.9%).
   - End-to-end ingestion latency SLO.

2. **Service-Level API Dashboard (RED)**:
   - Request throughput parsed by endpoint.
   - 4xx/5xx sparkline graphs.
   - 99th percentile response graphs highlighting the Geometry APIs.

3. **Infrastructure Dashboard (USE)**:
   - PostgreSQL DB connections and active locks.
   - Redis cluster memory/Eviction rates.
   - Pod/Container CPU and memory consumption.

### 3. Alerting & On-Call Playbooks

Alerts route severity into symptom-based actions:

| Alert Scenario | Threshold | Action Routing | SOP / Playbook |
| :--- | :--- | :--- | :--- |
| **API Error Rate High** | `> 5%` 5xx over `5 mins` | 🚨 PagerDuty (Wake) | Check DB connectivity and revert recent deploys. |
| **Ingestion Latency High** | `p99 > 2s` over `15 mins`| 🚨 PagerDuty (Wake) | Scale API nodes; verify PostGIS spatial index health. |
| **Database Connections High** | `> 80%` max_connections | 🎫 Jira Ticket | Analyze leaked connections or tune PgBouncer limit. |
| **Redis Saturation** | `> 85%` memory limit | 🎫 Jira Ticket | Increase Redis shard memory allocations. |

### 4. Security & Penetration Testing

- **Static Application Security Testing (SAST) & SCA**: Enforce `npm audit` and Snyk checks in CI pipelines.
- **OWASP Top 10 Mitigation**:
  - *Authentication*: JWT asymmetric signing (`RS256`); sensitive profile info stripped via `@Exclude()` annotations.
  - *Rate Limiting*: Apply `nestjs/throttler` across public endpoints (e.g. `POST /auth/register`).
  - *CORS & CSRF*: Rigid CORS whitelist (`ORIGIN` injection via Docker).
- **RBAC Validation**: Explicit testing mapping roles (Viewer, Editor, Admin) against boundaries.

### 5. Performance & Load Testing

Execute targeted performance load tests against heavily saturated boundaries using [k6](https://k6.io/).

**Key Constraint:** The `POST /tracking/ingest` and `POST /events/consume` pipelines must sustain high concurrency.

#### Example k6 Load Test Script
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

// Simulating 50 Concurrent devices hitting the endpoint 
export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests complete within 500ms
  },
};

export default function () {
  const payload = JSON.stringify({
    sessionId: "e5bf4e32-...-028392",
    locations: [{ longitude: 106.1, latitude: 10.1, timestamp: new Date().toISOString() }]
  });

  const headers = { 'Content-Type': 'application/json' };
  const res = http.post('http://localhost:3000/tracking/ingest', payload, { headers });

  check(res, {
    'status is 202': (r) => r.status === 202,
  });
  sleep(1);
}
```

## 📤 Output (Artifact)
This document finalizes the observability strategies. GeoTrack is prepared with visible operation lines to safely debug in real-time scenarios.

## ✅ Done Criteria
- [x] Telemetry Stack structure formally documented.
- [x] 3 Primary Dashboard definitions drafted.
- [x] Threshold-driven Alert & Runbook routes defined.
- [x] k6 performance testing strategy initialized.

## 🧠 What to Pay Attention To
- **Trace Contexts:** Do not let traces break when passing events from the Outbox into Redis consumers. The trace ID MUST wrap around event schemas.
- **Index Latency**: Logging doesn't mean much if queries hit full-table scans. Keep an eye on PostGIS performance under heavy payload insertions.

## Connection to Next Phase
Deploy, Stabilize & Evolve (Phase 9) leverages these dashboards and alerts immediately to gauge operational health when deploying GeoTrack to an active staging/production space.

# Phase 1 — Business & Domain Discovery

> **Product**: GeoTrack — A geospatial operations platform  
> **Updated**: 2026-04-07  
> **Status**: Draft — Awaiting Review

---

## 🎯 Goal

Deeply understand WHAT we're building, WHO we're building it for, WHY it matters, and WHAT can go wrong — before touching any architecture or code.

---

## 1. Vision Statement

**GeoTrack** is a production-grade geospatial operations platform that enables organizations to **draw, edit, and version geographic features** while simultaneously **tracking device movement in real-time** — with full spatial intelligence and temporal replay.

Think of it as **"Git for maps"** (full geometry versioning with diff, revert, and timeline playback) combined with **"real-time fleet tracker"** (continuous GPS ingestion with live map visualization) — unified in one spatial operations platform.

**Why now?** Existing solutions force teams to choose between GIS editing tools (ArcGIS, QGIS) and fleet tracking platforms (Samsara, Geotab). Organizations managing field assets — urban planners, logistics operators, utility companies — need both capabilities in one system, with proper version control and spatial query capabilities that current tools don't provide.

---

## 2. User Personas & Journeys

### 2.1 Personas

| Persona | Role | Goals | Pain Points |
|---------|------|-------|-------------|
| **Field Operator** | Draws boundaries, marks points of interest, reports from the field | Quick geometry creation, reliable GPS tracking | Losing edits, no version history, offline gaps |
| **GIS Analyst** | Runs spatial queries, analyzes tracking data, reviews history | Fast spatial operations, temporal analysis | Slow queries on large datasets, no time-slider |
| **Operations Manager** | Monitors fleet/devices, manages tracking sessions, views dashboards | Real-time visibility, session management | Delayed updates, no historical playback |
| **System Administrator** | Configures system, manages users, monitors health | Reliability, security, user management | Complex setup, poor observability |
| **IoT Device / GPS Tracker** | Sends continuous location updates | Reliable delivery, minimal battery usage | Network interruptions, GPS noise |

### 2.2 Core User Journeys

---

#### Journey 1: Draw & Edit Geometries

**Actor**: Field Operator / GIS Analyst

```
HAPPY PATH:
1. User opens map → views vector tile base map
2. User selects draw tool (point / polyline / polygon)
3. User draws geometry on map
4. System validates geometry (valid GeoJSON, reasonable coordinates)
5. User adds metadata (name, description, tags, properties)
6. User saves → System creates geometry with version 1
7. System emits GeometryCreated event
8. Other connected clients receive real-time update

EDIT PATH:
1. User selects existing geometry on map
2. User enters edit mode (move vertices, reshape, add buffer)
3. System shows previous geometry as ghost overlay
4. User confirms edit → System creates new version
5. System stores diff between v(N-1) and v(N)
6. System emits GeometryUpdated event
7. Old version remains accessible via history

ERROR PATHS:
→ Invalid geometry (self-intersecting polygon): 
   System rejects with validation error, highlights intersection point
→ Concurrent edit conflict: 
   System detects version mismatch, shows conflict dialog
   User chooses: merge, overwrite, or discard
→ Network failure during save: 
   Client queues edit locally, retries with exponential backoff
→ Geometry too complex (>10K vertices): 
   System warns user, suggests simplification
```

---

#### Journey 2: Real-Time Device Tracking

**Actor**: IoT Device → System → Operations Manager

```
HAPPY PATH:
1. Device starts tracking session (authenticated with session token)
2. Device sends GPS location every 1-5 seconds
   Payload: { lat, lng, altitude, speed, bearing, accuracy, timestamp }
3. System ingests via high-throughput queue
4. System validates + denoises (Kalman filter for GPS noise)
5. System stores in time-series database
6. System pushes to connected WebSocket clients
7. Operations Manager sees live movement on map

BATCH PATH:
1. Device buffers locations when offline
2. Device reconnects → sends batch of buffered locations
3. System processes batch, orders by timestamp
4. System handles out-of-order events gracefully
5. System backfills tracking trail on map

ERROR PATHS:
→ GPS noise / location jump:
   System applies Kalman filter, discards physically impossible jumps
   (e.g., >200km/h for vehicle, >50km/h for pedestrian)
→ Device loses network:
   Device buffers locally with timestamps, sends bulk on reconnect
→ High-frequency flood (malfunctioning device):
   System rate-limits per device (max 10 updates/sec)
→ Session not found / expired:
   System rejects with 401, device re-authenticates
→ Out-of-order timestamps:
   System reorders by device timestamp, not server timestamp
```

---

#### Journey 3: History Playback & Timeline

**Actor**: GIS Analyst

```
HAPPY PATH:
1. Analyst opens geometry detail panel
2. Analyst clicks "View History" → System loads version list
3. Analyst sees timeline: v1→v2→v3 with timestamps, authors, change type
4. Analyst selects version → Map renders that version's geometry
5. Analyst uses time slider → Map interpolates geometry state at that moment
6. Analyst compares two versions side-by-side → System highlights diff
7. Analyst reverts to previous version → System creates new version (v_revert)

TRACKING PLAYBACK:
1. Analyst selects device and time range
2. System queries time-series database for locations in range
3. Map renders tracking trail as animated polyline
4. Analyst controls playback speed (1x, 5x, 10x, 50x)
5. Analyst pauses at specific moment → sees exact position + metadata

ERROR PATHS:
→ Very long time range (1 year of data):
   System paginates, loads in chunks, shows progress bar
→ No data for selected range:
   System shows empty state with date range suggestion
→ Revert creates conflict with current state:
   System always creates new version (never overwrites)
   Revert is a forward action, not destructive
```

---

#### Journey 4: Spatial Queries & Analysis

**Actor**: GIS Analyst

```
HAPPY PATH:
1. Analyst draws query area on map (polygon, circle, or bounding box)
2. Analyst selects operation: Intersect / Contains / Within Distance
3. Analyst sets parameters (e.g., buffer distance: 500m)
4. System executes PostGIS spatial query
5. System returns matched geometries, highlighted on map
6. Analyst exports results (GeoJSON, CSV, Shapefile)

OPERATIONS:
- Buffer: Expand geometry by N meters → returns buffered geometry
- Intersect: Find all geometries intersecting with query area
- Containment: Check if point is inside polygon
- Distance: Find all geometries within N meters of a point
- Bounding Box: Fast pre-filter using spatial index

ERROR PATHS:
→ Query area too large (entire country):
   System limits query area, suggests tiling
→ Result set too large (>10K geometries):
   System paginates, returns count first with "load more"
→ Timeout on complex operation:
   System runs async, notifies when complete
→ Invalid query geometry:
   System validates before execution, returns specific error
```

---

#### Journey 5: Admin & Session Management

**Actor**: System Administrator / Operations Manager

```
HAPPY PATH:
1. Admin creates organization → configures settings
2. Admin invites users → assigns roles (viewer, editor, admin)
3. Admin creates tracking session → assigns to device(s)
4. Admin monitors active sessions dashboard
5. Admin views system health (ingestion rate, queue depth, storage usage)
6. Admin revokes user access / ends session

ERROR PATHS:
→ Unauthorized access attempt:
   System logs event, rate-limits, optionally locks account
→ Session exceeds storage quota:
   System warns, then throttles ingestion
→ Bulk user import fails:
   System validates all before importing, returns error report
```

---

## 3. MVP Scope (IN / OUT)

| Feature | v1 (MVP) | v2+ (Future) |
|---------|:--------:|:------------:|
| **MAP** | | |
| Display vector tile base map | ✅ IN | |
| Draw point, polyline, polygon | ✅ IN | |
| Edit geometries (move, reshape, delete) | ✅ IN | |
| Buffer operation on geometries | ✅ IN | |
| Multiple base map layers | | 🔜 OUT |
| Offline map tiles | | 🔜 OUT |
| 3D terrain visualization | | 🔜 OUT |
| **TRACKING** | | |
| Ingest GPS locations from devices | ✅ IN | |
| Store tracking data in time-series DB | ✅ IN | |
| Real-time location push via WebSocket | ✅ IN | |
| Session-based tracking | ✅ IN | |
| GPS noise filtering (Kalman filter) | ✅ IN | |
| Device offline buffering / batch upload | | 🔜 OUT |
| Map matching (snap to road) | | 🔜 OUT |
| Geofence alerts | | 🔜 OUT |
| **HISTORY / VERSIONING** | | |
| Full version history for geometries | ✅ IN | |
| Version diff (what changed) | ✅ IN | |
| Revert to previous version | ✅ IN | |
| Timeline slider for geometry history | ✅ IN | |
| Tracking playback (animated trail) | ✅ IN | |
| Geometry diff visualization (overlay) | | 🔜 OUT |
| Branch/merge (Git-style) for geometries | | 🔜 OUT |
| **SPATIAL OPERATIONS** | | |
| Buffer | ✅ IN | |
| Intersect | ✅ IN | |
| Point-in-polygon | ✅ IN | |
| Distance queries | ✅ IN | |
| Bounding box / radius queries | ✅ IN | |
| Union / Difference | | 🔜 OUT |
| Voronoi / Convex hull | | 🔜 OUT |
| Heatmap from tracking data | | 🔜 OUT |
| **USER / AUTH** | | |
| JWT-based authentication | ✅ IN | |
| Role-based access (viewer/editor/admin) | ✅ IN | |
| Organization multi-tenancy | | 🔜 OUT |
| OAuth2 / SSO integration | | 🔜 OUT |
| **SYSTEM** | | |
| REST API for all operations | ✅ IN | |
| WebSocket for real-time updates | ✅ IN | |
| Event-driven architecture (internal) | ✅ IN | |
| API rate limiting | ✅ IN | |
| Export (GeoJSON) | ✅ IN | |
| Import (GeoJSON, Shapefile, KML) | | 🔜 OUT |
| Mobile app | | 🔜 OUT |
| Public/embeddable map | | 🔜 OUT |

---

## 4. Non-Functional Requirements (NFR Matrix)

### 4.1 Full NFR Matrix

| Dimension | Requirement | Target | Rationale |
|-----------|-------------|--------|-----------|
| **Availability** | System uptime | 99.9% (8.76 hrs/yr downtime) | Fleet tracking must be reliable but not life-critical |
| **Latency — Tracking** | Location ingestion p99 | < 200ms | Real-time feel for live tracking |
| **Latency — API** | Geometry CRUD p99 | < 500ms | Responsive editing experience |
| **Latency — Spatial** | Spatial query p99 | < 2,000ms | Complex queries acceptable slower |
| **Latency — WebSocket** | Real-time push latency | < 300ms from ingestion | Near real-time map updates |
| **Throughput — Tracking** | Peak location ingestion | 50,000 updates/sec | 10K devices × 5 updates/sec at peak |
| **Throughput — API** | Peak API requests | 1,000 RPS | 500 users × 2 actions/sec |
| **Throughput — Tiles** | Map tile requests | 10,000 RPS (cacheable) | Heavy initial map loads |
| **Data Volume — 1yr** | Tracking data | ~500 GB | 10K devices × 86,400 pts/day × 200 bytes × 365 |
| **Data Volume — 1yr** | Geometry + versions | ~50 GB | ~5K edits/day × 10KB avg × 365 |
| **Data Volume — 3yr** | Total storage | ~1.7 TB | Linear growth, tracking dominates |
| **Consistency — Geometry** | Geometry CRUD | Strong (read-after-write) | Editing requires immediate consistency |
| **Consistency — Tracking** | Location ingestion | Eventual (< 2s) | Slight delay acceptable for analytics |
| **Consistency — History** | Version reads | Strong (read-after-write) | Must see latest version after save |
| **Security** | Data at rest | AES-256 encryption | Standard for location/PII data |
| **Security** | Data in transit | TLS 1.3 | No plaintext GPS data |
| **Durability** | Data durability | 99.999999% (8 nines) | No data loss for tracking or geometries |

### 4.2 Consistency Model Per Feature

| Feature | Consistency | Model | Why |
|---------|-------------|-------|-----|
| Geometry Create/Update/Delete | Strong | Read-after-write | User must see their edit immediately |
| Tracking Ingestion | Eventual | Write-behind queue | High throughput trumps immediate consistency |
| Tracking Read (live map) | Eventual | ~1-2s lag | Acceptable for fleet visualization |
| Version History | Strong | Synchronous write | Must see accurate history after edit |
| Spatial Queries | Strong | Read from primary | Results must reflect latest state |
| User Auth / Sessions | Strong | Synchronous | Security-critical |

---

## 5. Traffic Estimation Model

### 5.1 Back of Envelope

```
TRACKING INGESTION (write-heavy, highest volume):
─────────────────────────────────────────────────
Active devices:          10,000
Updates per device/sec:  1 (normal), 5 (peak)
Normal RPS:              10,000 updates/sec
Peak RPS:                50,000 updates/sec (rush hour / emergency)
Payload per update:      ~200 bytes
Normal bandwidth:        2 MB/sec
Peak bandwidth:          10 MB/sec

Storage per day:         10,000 × 86,400 × 200B = ~172 GB/day (at 1/sec continuous)
Realistic (8hr active):  10,000 × 28,800 × 200B = ~57 GB/day
Storage per year:        ~20 TB (continuous) or ~6.5 TB (8hr active)

With compression (4:1):  ~1.6 TB/year (continuous) or ~500 GB/year (realistic)

GEOMETRY API (moderate volume):
────────────────────────────────
Human users (DAU):       500
Actions per user/day:    50 (views, edits, queries)
Daily API calls:         25,000
RPS (avg):               25,000 / 28,800 (8hr) = ~0.9 RPS
RPS (peak, 10x):         ~9 RPS
RPS (burst, 100x):       ~90 RPS (team reviewing same area)

MAP TILE REQUESTS:
──────────────────
Per user session:        ~200 tile requests (initial load)
Active sessions:         500 concurrent at peak
Tile RPS (peak):         500 × 5 = 2,500 RPS (mostly CDN-cached)
Cache hit ratio:         ~90% (tiles are static for same zoom/extent)
Origin RPS:              ~250 RPS

WEBSOCKET CONNECTIONS:
──────────────────────
Active connections:      500 human + 10,000 devices = 10,500
Messages per sec (push): 10,000 (location broadcasts)
Fan-out factor:          ~10 (avg viewers per tracked area)
Push messages/sec:       ~100,000 (10K locations × 10 subscribers)

SPATIAL QUERIES:
────────────────
Queries per day:         5,000
Avg query time:          200ms (indexed), 2s (complex)
Peak concurrent:         ~20 simultaneous spatial queries
```

### 5.2 Storage Projection

| Data Type | 1 Year | 3 Years | Growth Rate |
|-----------|--------|---------|-------------|
| Tracking (location points) | 500 GB | 1.5 TB | Linear |
| Geometries (current state) | 5 GB | 15 GB | Linear |
| Geometry Versions (history) | 50 GB | 150 GB | Linear |
| Event Store (domain events) | 20 GB | 60 GB | Linear |
| Indexes (spatial + temporal) | 100 GB | 300 GB | Linear |
| Tiles Cache | 10 GB | 10 GB | Stable (CDN) |
| Logs + Metrics | 50 GB | 50 GB | Rotated |
| **Total** | **~735 GB** | **~2.1 TB** | |

### 5.3 Peak Sizing

| Metric | Normal | Peak (10x) | Design For |
|--------|--------|------------|------------|
| Tracking ingestion (write) | 10K/sec | 50K/sec | 100K/sec (headroom) |
| API requests | 10 RPS | 100 RPS | 500 RPS (with cache) |
| WebSocket connections | 5K | 10K | 20K (with scaling) |
| WebSocket push messages | 50K/sec | 100K/sec | 200K/sec |
| Tile requests (total) | 1K RPS | 5K RPS | CDN handles |
| Spatial queries | 5/sec | 20/sec | 50/sec |
| Active DB connections | 50 | 200 | 300 (with pooling) |

---

## 6. SLO Table (Per Journey)

| Journey | SLI (Indicator) | SLO (Objective) | Error Budget (30 days) |
|---------|-----------------|------------------|----------------------|
| **Draw & Edit** | Successful save rate | 99.9% of saves succeed | 43 failed saves |
| **Draw & Edit** | Save latency (p99) | < 500ms | — |
| **Tracking Ingestion** | Ingestion success rate | 99.95% | 216,000 lost points |
| **Tracking Ingestion** | Ingestion latency (p99) | < 200ms | — |
| **Real-time Push** | WebSocket delivery rate | 99.9% | 43,200 missed pushes |
| **Real-time Push** | Push latency (p99) | < 300ms from ingestion | — |
| **History Playback** | Timeline load success | 99.9% | 43 failures |
| **History Playback** | Timeline load latency (p95) | < 1,000ms for last 100 versions | — |
| **Spatial Query** | Query success rate | 99.9% | 5 failures |
| **Spatial Query** | Query latency (p99) | < 2,000ms (indexed), < 10s (complex) | — |
| **Map Tile Serving** | Tile delivery success | 99.95% | CDN handles |
| **Map Tile Serving** | Tile latency (p95) | < 100ms (CDN hit), < 500ms (origin) | — |
| **Authentication** | Login success rate | 99.99% | 1 failure |
| **Authentication** | Login latency (p99) | < 300ms | — |
| **System Availability** | Overall uptime | 99.9% | 43 min downtime |

---

## 7. Risk Register (Top 10)

| # | Risk | Category | Prob (1-5) | Impact (1-5) | Score | Mitigation |
|---|------|----------|:----------:|:------------:|:-----:|------------|
| 1 | **Tracking ingestion overwhelm** — 50K+ GPS updates/sec causes queue backpressure, data loss | Technical | 4 | 5 | **20** | Kafka partitioning by device_id; consumer group auto-scaling; back-pressure with rate limiting; DLQ for unprocessable |
| 2 | **GPS noise corruption** — Noisy/spoofed GPS data pollutes tracking database | Technical | 5 | 3 | **15** | Kalman filter on ingestion; physically impossible jump rejection (>200km/h); accuracy threshold filtering; spoofing detection |
| 3 | **Concurrent geometry edit conflicts** — Two users editing same geometry simultaneously | Technical | 3 | 4 | **12** | Optimistic locking with version numbers; conflict detection at save; last-write-wins with full audit trail; optional real-time edit locking via WebSocket |
| 4 | **Large polygon performance** — Polygons with >100K vertices degrade spatial query performance | Technical | 3 | 4 | **12** | Geometry simplification on render (Douglas-Peucker); LOD for different zoom levels; vertex count limits with warnings; spatial index (GiST) optimization |
| 5 | **Time-series data growth** — Tracking data grows to TB scale within 1 year | Technical | 5 | 3 | **15** | TimescaleDB automatic partitioning (chunk per day); retention policies (raw: 90 days, downsampled: 3 years); continuous aggregates for analytics |
| 6 | **WebSocket connection scaling** — 10K+ concurrent connections overwhelm single server | Technical | 4 | 3 | **12** | Sticky sessions with load balancer; Redis pub/sub for cross-instance fanout; connection limits per user; horizontal scaling with Socket.IO adapter |
| 7 | **Vendor lock-in on map tiles** — Dependency on single tile provider (Mapbox/Google) creates cost and availability risk | Business | 3 | 3 | **9** | OpenStreetMap as fallback; self-hosted tile server as option; abstraction layer for tile sources; CDN caching reduces origin dependency |
| 8 | **PII exposure in location data** — GPS tracking data is personally identifiable; breach = legal risk | Security | 2 | 5 | **10** | Encryption at rest (AES-256) and in transit (TLS 1.3); location data anonymization options; RBAC on tracking queries; data retention policies; GDPR compliance |
| 9 | **Out-of-order event processing** — Events arriving out of sequence cause incorrect state reconstruction | Technical | 4 | 3 | **12** | Idempotent event processing with event_id dedup; timestamp-based ordering (device timestamp, not server); event sequence numbers per stream; inbox pattern |
| 10 | **Single point of failure — Event store** — History/version service failure loses edit history | Technical | 2 | 5 | **10** | Transactional outbox (events written with entity); async projection to event store; PostgreSQL replication for event store; replay capability from outbox |

### Risk Matrix Visualization

```
IMPACT →     1        2        3        4        5
PROB ↓   ┌────────┬────────┬────────┬────────┬────────┐
  5      │        │        │ R2,R5  │        │        │
         ├────────┼────────┼────────┼────────┼────────┤
  4      │        │        │ R6,R9  │        │ R1     │
         ├────────┼────────┼────────┼────────┼────────┤
  3      │        │        │ R7     │ R3,R4  │        │
         ├────────┼────────┼────────┼────────┼────────┤
  2      │        │        │        │        │ R8,R10 │
         ├────────┼────────┼────────┼────────┼────────┤
  1      │        │        │        │        │        │
         └────────┴────────┴────────┴────────┴────────┘
          Trivial   Minor   Moderate  Major   Critical
```

**Priority Tiers:**
- 🔴 **Critical (15-25):** R1 (ingestion overwhelm), R2 (GPS noise), R5 (data growth) — Address in architecture
- 🟡 **High (10-14):** R3, R4, R6, R8, R9, R10 — Address in design
- 🟢 **Medium (5-9):** R7 (vendor lock-in) — Monitor

---

## 8. Domain Vocabulary (Ubiquitous Language)

| Term | Definition |
|------|------------|
| **Geometry** | A spatial object (point, polyline, or polygon) with properties, stored as GeoJSON |
| **Feature** | A geometry combined with metadata (name, tags, properties) — the primary entity users interact with |
| **Version** | An immutable snapshot of a feature's state at a point in time |
| **Changeset** | A group of related feature changes, similar to a Git commit |
| **Track** | A continuous stream of location points from a single device during a session |
| **Location Point** | A single GPS reading: lat, lng, altitude, speed, bearing, accuracy, timestamp |
| **Tracking Session** | A bounded period during which a device actively reports locations |
| **Spatial Query** | An operation that finds features based on geometric relationships (intersect, contain, distance) |
| **Buffer** | Expanding a geometry outward by a specified distance in all directions |
| **Time Slider** | UI control that allows scrubbing through time to see historical state |
| **Playback** | Animated replay of tracking data or geometry changes over time |
| **Feature Diff** | The difference between two versions of a feature (what vertices changed) |
| **Bounding Box** | The minimum rectangle (in lat/lng) enclosing a geometry; used for fast spatial filtering |
| **GiST Index** | Generalized Search Tree — PostgreSQL/PostGIS index for efficient spatial queries |
| **Device** | Any GPS-enabled entity that reports location data (vehicle, phone, IoT sensor) |
| **Correlation ID** | Unique identifier propagated across service boundaries for distributed tracing |

---

## ✅ Phase 1 Done Criteria Checklist

| Criterion | Status |
|-----------|--------|
| Vision is 1 page, clear | ✅ Complete |
| ≥ 3 user journeys with error paths | ✅ 5 journeys documented |
| MVP scope has explicit IN/OUT list | ✅ 38 features classified |
| All NFR dimensions documented | ✅ 8/8 dimensions |
| Traffic model has RPS + storage + peak | ✅ Complete with projections |
| SLO table per journey | ✅ 14 SLOs defined |
| Top 10 risks scored and triaged | ✅ All with mitigation plans |

---

## Connection to Next Phase

**Phase 2: Architecture & Domain Design** will use:
- **User journeys** → derive bounded contexts and service boundaries
- **NFRs** → drive architectural decisions (tracking throughput → Kafka, geometry consistency → PostgreSQL)
- **Traffic model** → size infrastructure and select technologies
- **Risks** → inform resilience patterns and data partitioning strategies
- **Consistency models** → determine sync vs async communication per context

### 🛑 APPROVAL GATE → 📋 Document Review → Review this document before proceeding to Phase 2

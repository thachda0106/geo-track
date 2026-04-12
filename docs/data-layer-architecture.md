# GeoTrack — Data Layer Architecture

> Documentation cho tầng dữ liệu: PostgreSQL schemas, bảng, indexes, Redis patterns, concurrency strategies, idempotency, và data lifecycle.

---

## Database Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL + Extensions                         │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐              │
│  │  PostGIS    │  │ TimescaleDB  │  │  uuid-ossp    │              │
│  │  Spatial    │  │  Time-series │  │  UUID gen     │              │
│  └─────────────┘  └──────────────┘  └───────────────┘              │
│                                                                     │
│  ┌── identity ──┐  ┌── geometry ──┐  ┌── versioning ─┐            │
│  │ users        │  │ features     │  │ versions       │            │
│  │ refresh_token│  │ (+ PostGIS)  │  │ changesets     │            │
│  │ audit_log    │  │              │  │                │            │
│  └──────────────┘  └──────────────┘  └────────────────┘            │
│                                                                     │
│  ┌── tracking ──────────────────┐  ┌── infrastructure ───────────┐ │
│  │ sessions                     │  │ outbox           (event bus) │ │
│  │ tracks                       │  │ outbox_dlq       (dead letter│ │
│  │ location_points (hypertable) │  │ inbox            (dedup)     │ │
│  │ location_5min   (agg view)   │  │                              │ │
│  │ location_1hr    (agg view)   │  └──────────────────────────────┘ │
│  └──────────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          Redis                                       │
│                                                                     │
│  device:{id}          → HASH   (real-time location state)           │
│  region:{name}:geoset → ZSET   (GEOADD spatial index)              │
│  loc:{deviceId}       → STRING (location cache for reads)           │
│  rate-limit keys      → STRING (Throttler state)                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## PostgreSQL Schemas

### Schema: `identity` — Authentication & Users

#### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` | User ID |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt hash (12 rounds) |
| `display_name` | VARCHAR(100) | NOT NULL | Display name |
| `role` | VARCHAR(20) | default `'viewer'` | `viewer` \| `editor` \| `admin` |
| `status` | VARCHAR(20) | default `'active'` | `active` \| `disabled` |
| `last_login_at` | TIMESTAMPTZ | nullable | Last login time |
| `created_at` | TIMESTAMPTZ | default `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | auto-update | — |

#### `refresh_tokens`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Token ID |
| `user_id` | UUID | FK → users, ON DELETE CASCADE | Owner |
| `token_hash` | VARCHAR(255) | UNIQUE | SHA-256 hash of token value |
| `family_id` | UUID | indexed | Token rotation family (detect reuse attacks) |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Token expiration |
| `is_revoked` | BOOLEAN | default false | Revocation flag |
| `revoked_at` | TIMESTAMPTZ | nullable | When revoked |

**Token rotation security:**
```
family_id groups all tokens in a rotation chain.
If a revoked token is used → revoke ALL tokens in that family (compromise detected).
```

#### `audit_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | PK, auto-increment (append-only, no UUID needed) |
| `user_id` | UUID | FK → users (nullable for system actions) |
| `action` | VARCHAR(50) | `login`, `logout`, `password_change`, etc. |
| `ip_address` | VARCHAR(45) | Client IP (supports IPv6) |
| `user_agent` | TEXT | Browser/device info |
| `details` | JSONB | Additional context |
| `created_at` | TIMESTAMPTZ | Event time |

**Index:** `(user_id, created_at DESC)` — "show me this user's recent activity"

---

### Schema: `geometry` — GeoJSON Features

#### `features`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Feature ID |
| `name` | VARCHAR(255) | NOT NULL | Feature name |
| `description` | TEXT | nullable | — |
| `geometry_type` | VARCHAR(20) | NOT NULL | `Point` \| `LineString` \| `Polygon` |
| `geometry` | GEOMETRY(Geometry, 4326) | PostGIS | Spatial data (SRID 4326 = WGS84) |
| `properties` | JSONB | default `{}` | GeoJSON properties |
| `tags` | TEXT[] | default `[]` | Array of tags |
| `current_version` | INT | default 1 | **Optimistic locking counter** |
| `created_by` | UUID | NOT NULL | Creator user ID |
| `updated_by` | UUID | NOT NULL | Last editor |
| `is_deleted` | BOOLEAN | default false | **Soft delete** flag |
| `deleted_at` | TIMESTAMPTZ | nullable | When soft-deleted |

**PostGIS spatial index:**
```sql
CREATE INDEX idx_features_geom ON geometry.features USING GIST (geometry);
-- Enables: ST_Intersects, ST_DWithin, ST_Contains, ST_Buffer queries
```

**Soft delete pattern:**
```sql
-- All queries filter: WHERE is_deleted = FALSE
-- Delete = UPDATE SET is_deleted = TRUE (data preserved for audit/undo)
-- Hard delete via scheduled cleanup (if needed)
```

---

### Schema: `versioning` — Version History

#### `versions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Version ID |
| `feature_id` | UUID | NOT NULL | Which feature |
| `version_number` | INT | NOT NULL | Sequential per feature |
| `change_type` | VARCHAR(20) | NOT NULL | `created` \| `updated` \| `geometry_updated` |
| `snapshot_geometry` | GEOMETRY(Geometry, 4326) | PostGIS | Full geometry at this version |
| `snapshot_properties` | JSONB | | Full properties snapshot |
| `snapshot_name` | VARCHAR(255) | | Name at this version |
| `diff` | JSONB | nullable | Delta from previous version |
| `author_id` | UUID | NOT NULL | Who made the change |
| `message` | TEXT | nullable | Commit message |
| `parent_version_id` | UUID | FK → versions (self-ref) | Previous version |
| `vertex_count` | INT | nullable | Geometry complexity |
| `area_sqm` | FLOAT | nullable | Area (for polygons) |
| `length_m` | FLOAT | nullable | Length (for lines) |

**Unique constraint:** `(feature_id, version_number)` — no duplicate versions per feature.

**Self-referential chain:**
```
Version 1 (parent: null)
    └── Version 2 (parent: v1)
          └── Version 3 (parent: v2)
                └── Version 4 (parent: v3)
```

#### `changesets`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `author_id` | UUID | Who authored |
| `message` | TEXT | Commit message |
| `version_ids` | UUID[] | Array of version IDs in this changeset |
| `feature_count` | INT | Number of features modified |

Groups multiple version changes into a single atomic commit (like a Git commit).

---

### Schema: `tracking` — GPS Time-Series

#### `sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `device_id` | UUID | IoT device identifier |
| `owner_id` | UUID | User who owns the device |
| `status` | VARCHAR(20) | `active` \| `paused` \| `ended` |
| `min_interval_ms` | INT | Min time between points (default: 1000ms) |
| `max_speed_kmh` | FLOAT | Speed filter threshold (default: 200) |
| `accuracy_threshold_m` | FLOAT | Accuracy filter (default: 50m) |
| `tracking_mode` | VARCHAR(20) | `continuous` \| `interval` |
| `total_points` | BIGINT | Running count |
| `total_distance_m` | FLOAT | Running total distance |
| `last_lat/lng` | FLOAT | Last known position |

#### `location_points` (TimescaleDB Hypertable)

| Column | Type | Description |
|--------|------|-------------|
| `time` | TIMESTAMPTZ | NOT NULL — partition key |
| `session_id` | UUID | FK → sessions |
| `device_id` | UUID | Device ID |
| `lat` | DOUBLE PRECISION | Latitude |
| `lng` | DOUBLE PRECISION | Longitude |
| `altitude` | DOUBLE PRECISION | Meters above sea level |
| `speed` | DOUBLE PRECISION | km/h |
| `bearing` | DOUBLE PRECISION | Heading in degrees |
| `accuracy` | DOUBLE PRECISION | GPS accuracy in meters |
| `is_filtered` | BOOLEAN | Outlier flag (speed/accuracy filter) |
| `geom` | GEOMETRY(Point, 4326) | Auto-generated by trigger from lat/lng |

**TimescaleDB configuration:**
```
Chunk interval:   1 day (optimized for "last 24h" queries)
Compression:      After 7 days (segment by session_id)
Retention:        Drop chunks older than 1 year
```

#### Continuous Aggregates (Materialized Views)

| View | Bucket | Refresh | Use case |
|------|--------|---------|----------|
| `location_5min` | 5 minutes | Every 5 min | Dashboard, trail preview |
| `location_1hr` | 1 hour | Every 1 hour | Daily summary, analytics |

```
Raw (1 point/sec):     86,400 points/day/device
5min aggregate:        288 rows/day/device        → 300× reduction
1hr aggregate:         24 rows/day/device          → 3,600× reduction
```

---

### Schema: `infrastructure` — Event-Driven Messaging

#### `outbox` (Transactional Outbox)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | PK, auto-increment |
| `event_type` | VARCHAR(100) | `FeatureCreated`, `FeatureUpdated`, etc. |
| `aggregate_id` | UUID | Feature/entity ID |
| `aggregate_type` | VARCHAR(50) | `Feature`, `Session`, etc. |
| `payload` | JSONB | Event data |
| `correlation_id` | UUID | Request tracing ID |
| `published_at` | TIMESTAMPTZ | Null = unpublished |
| `retry_count` | INT | Publish attempts |
| `max_retries` | INT | Max before DLQ (default: 3) |
| `last_error` | TEXT | Last publish error |

#### `outbox_dlq` (Dead Letter Queue)

Events that permanently failed after max retries. Same structure + `error_message`.

#### `inbox` (Idempotent Event Processing)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `event_id` | UUID | PK | Unique event ID |
| `event_type` | VARCHAR(100) | | Event type |
| `processed_at` | TIMESTAMPTZ | | When processed |

---

## Concurrency Strategies

### 1. Optimistic Locking — Feature Updates

```
Client reads feature (version = 3)
Client sends update with expectedVersion = 3

Application layer:
  if (feature.currentVersion !== dto.expectedVersion) {
    throw ConflictError(currentVersion=4, expected=3);
    // → 409 Conflict
  }

Database layer (double-check):
  UPDATE features SET ...
  WHERE id = $1 AND current_version = 3    ← old version
  // If someone else updated to v4, this returns 0 rows → ConflictError
```

```
User A reads v3 ─────────── Update with v3 ──→ Success (v3→v4) ✅
User B reads v3 ─────────────────────── Update with v3 ──→ CONFLICT ❌
                                                            (current is v4, expected v3)
                                        User B must re-read v4 and retry
```

**Two layers of protection:**
1. **Application layer** — use-case checks `expectedVersion` before updating
2. **Database layer** — `WHERE current_version = N-1` ensures no TOCTOU race

### 2. Pessimistic Locking — Feature Deletes

```sql
-- Lock the row first (no one else can modify)
SELECT id, current_version FROM features
WHERE id = $1 AND is_deleted = FALSE
FOR UPDATE;                              -- ← row-level lock

-- Then check version and soft-delete
UPDATE features SET is_deleted = TRUE WHERE id = $1;
```

**Why pessimistic for delete?** Delete is destructive — we can't "merge" concurrent deletes like we could with updates.

### 3. Outbox Relay — SKIP LOCKED

```sql
-- Multiple relay instances won't process the same events
SELECT * FROM outbox
WHERE published_at IS NULL
ORDER BY id ASC
LIMIT 50
FOR UPDATE SKIP LOCKED;    -- ← skip rows locked by other relays
```

**`SKIP LOCKED` prevents:** Two relay pods (accidental parallel run) from double-publishing the same event.

### 4. Redis Lua Script — Atomic Location Updates

```lua
-- Atomic: read current timestamp + compare + write
-- No race condition between read and write
local current_ts = tonumber(redis.call('HGET', KEYS[1], 'ts')) or 0
local new_ts = tonumber(ARGV[1])

if new_ts >= current_ts then
  redis.call('HSET', KEYS[1], 'payload', ARGV[2], 'ts', ARGV[1])
  redis.call('EXPIRE', KEYS[1], 86400)
  redis.call('GEOADD', KEYS[2], ARGV[3], ARGV[4], KEYS[1])
  return 1    -- updated
else
  return 0    -- stale, ignored
end
```

**Why Lua?** Redis is single-threaded but commands can interleave. Lua scripts execute atomically — no other command runs between our HGET and HSET.

---

## Idempotency Strategies

### 1. Inbox Pattern — Event Consumers

```
Event arrives: { eventId: "abc-123", type: "FeatureCreated" }

INSERT INTO inbox (event_id, event_type, processed_at)
VALUES ('abc-123', 'FeatureCreated', NOW())
ON CONFLICT (event_id) DO NOTHING        ← key!
RETURNING TRUE as inserted;

If returned rows = 0 → duplicate, skip
If returned rows = 1 → first time, process
```

**Atomic claim:** `INSERT ON CONFLICT` is a single SQL statement — no TOCTOU race between "check if exists" and "mark as processed".

**Failure rollback:** If the handler throws, we DELETE the inbox entry so the event can be retried.

### 2. Upsert Seed Data

```typescript
await prisma.user.upsert({
  where: { email: 'admin@geotrack.dev' },
  update: {},        // no-op if exists
  create: { ... },   // create if not exists
});
```

### 3. Redis Timestamp Guard

```
Location update arrives with timestamp T=100

Redis state: { ts: 105 }    ← already has NEWER data
T=100 < T=105 → SKIP (stale data)

→ Out-of-order messages are safely ignored
```

### 4. Migration Idempotency

```sql
CREATE TABLE IF NOT EXISTS ...;
CREATE INDEX IF NOT EXISTS ...;
SELECT create_hypertable(..., if_not_exists => TRUE);
SELECT add_compression_policy(..., if_not_exists => TRUE);
```

Every DDL statement is idempotent — safe to re-run.

---

## Redis Key Patterns

| Key Pattern | Type | TTL | Description |
|-------------|------|-----|-------------|
| `device:{deviceId}` | HASH | 24h | Current device state (payload + timestamp) |
| `region:{name}:geoset` | ZSET (GEO) | — | Geo-spatial index for nearby device queries |
| `loc:{deviceId}` | STRING | Short | Cached location for read path (circuit breaker fallback) |
| Rate limit keys | STRING | 1-60s | Throttler state (managed by `@nestjs/throttler`) |

### Read Path with Circuit Breaker

```
getLatestLocation(deviceId)
    │
    ▼
┌── Redis (Fast Path) ──┐
│  GET loc:{deviceId}    │
│  Hit? → return cached  │──→ Response (< 1ms)
│  Miss? ──────────┐     │
└──────────────────│─────┘
                   │
                   ▼
┌── Circuit Breaker ─────────────────────────┐
│  CLOSED → query Postgres                    │
│  OPEN   → fail fast / return null           │
│  HALF_OPEN → test 1 query                   │
│                                             │
│  Opens if >50% requests fail within 10s     │
│  Tests recovery every 5s                    │
└─────────────────────────────────────────────┘
```

### Write Path with Pipeline

```
IoT batch arrives (500 points)
    │
    ▼
PostgreSQL: INSERT INTO location_points (batch)
    │
    ▼ (after commit)
Redis Pipeline: 500 Lua commands in 1 network round-trip
    ├── HSET device:aaa payload ... ts ...
    ├── GEOADD region:hcm:geoset ... device:aaa
    ├── HSET device:bbb payload ... ts ...
    ├── GEOADD region:hcm:geoset ... device:bbb
    └── ... (×500)
    │
    ▼
If Redis fails → swallow error (Postgres is source of truth)
                  Redis cache reconstructs on next read
```

---

## Transaction Boundaries

### Feature Create/Update — Single Transaction

```
$transaction {
  1. INSERT/UPDATE geometry.features
  2. INSERT INTO infrastructure.outbox (event)
}
// Both succeed or both rollback
// Event is guaranteed to exist if feature was saved
```

### Feature Delete — Transaction with Lock

```
$transaction {
  1. SELECT ... FOR UPDATE (lock the row)
  2. Version check (optimistic locking)
  3. UPDATE SET is_deleted = TRUE (soft delete)
  4. INSERT INTO infrastructure.outbox ('FeatureDeleted')
}
```

### Outbox Relay — Transaction with Skip Locked

```
$transaction {
  1. SELECT FROM outbox WHERE published_at IS NULL FOR UPDATE SKIP LOCKED
  2. Emit events to EventEmitter (or Kafka)
  3. UPDATE outbox SET published_at = NOW() (only successful ones)
  4. Failed events → incrementRetry() or moveToDeadLetter()
}
```

---

## Data Lifecycle

```
Feature Lifecycle:
  Created (v1) → Updated (v2) → Updated (v3) → Soft Deleted
      │              │              │               │
      ▼              ▼              ▼               ▼
  Version 1      Version 2     Version 3      FeatureDeleted
  (snapshot)     (snapshot)    (snapshot)      (outbox event)

Location Point Lifecycle:
  Ingested → Stored (hypertable)
                │
                ├── 5min aggregate (materialized view, auto-refresh)
                ├── 1hr aggregate (materialized view, auto-refresh)
                ├── After 7 days → compressed (10× storage reduction)
                └── After 1 year → dropped (retention policy)

Outbox Event Lifecycle:
  Created (published_at=NULL)
    │
    ├── Relay publishes → published_at = NOW()
    │   └── After 24h → cleaned up (hourly job)
    │
    └── Relay fails → retry_count++
        ├── retry < max → stays in outbox for next cycle
        └── retry >= max → moved to outbox_dlq (manual review)
```

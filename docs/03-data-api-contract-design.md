# Phase 3 — Data, API & Contract Design

> **Product**: GeoTrack — Geospatial Operations Platform  
> **Updated**: 2026-04-07  
> **Status**: Draft — Awaiting Review  
> **Input**: [Phase 2 — Architecture & Domain Design](./02-architecture-domain-design.md)

---

## 🎯 Goal

Design ALL data models, API contracts, and event schemas BEFORE writing code. **Contracts are the source of truth.** Code conforms to contracts, not the other way around.

---

## 1. Data Models Per Module

### 1.1 Storage Type Matrix

| Module | Primary Store | Why | Secondary |
|--------|--------------|-----|-----------|
| Identity | PostgreSQL (`identity` schema) | Relational, strong consistency | Redis (session cache) |
| Geometry | PostgreSQL + PostGIS (`geometry` schema) | Spatial indexes (GiST), spatial functions | Redis (feature cache) |
| Versioning | PostgreSQL (`versioning` schema) | Relational, strong consistency, JSONB for snapshots | — |
| Tracking | TimescaleDB (`tracking` schema) | Time-series partitioning, compression, retention | Redis (latest position cache) |
| Shared | — | — | Redis (rate limiter, pub/sub) |

---

### 1.2 Identity Schema

```sql
-- ============================================================
-- SCHEMA: identity
-- Owner: Identity Module
-- ============================================================

CREATE SCHEMA IF NOT EXISTS identity;

-- ─── Users ────────────────────────────────────────────────────
CREATE TABLE identity.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,        -- bcrypt, cost=12
    display_name    VARCHAR(100) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'viewer',  -- viewer | editor | admin
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | inactive | suspended
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_role_check CHECK (role IN ('viewer', 'editor', 'admin')),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE INDEX idx_users_email ON identity.users (email);
CREATE INDEX idx_users_status ON identity.users (status) WHERE status = 'active';

-- ─── Refresh Tokens ───────────────────────────────────────────
CREATE TABLE identity.refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,         -- SHA-256 hash of actual token
    expires_at      TIMESTAMPTZ NOT NULL,
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ,

    CONSTRAINT refresh_tokens_hash_unique UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_tokens_user ON identity.refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expiry ON identity.refresh_tokens (expires_at)
    WHERE is_revoked = FALSE;

-- ─── Audit Log (Identity) ────────────────────────────────────
CREATE TABLE identity.audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES identity.users(id),
    action          VARCHAR(50) NOT NULL,           -- login | logout | role_change | password_change
    ip_address      INET,
    user_agent      TEXT,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON identity.audit_log (user_id, created_at DESC);
```

**Growth Projection**:
- Users: ~1,000 rows (1 year), ~5,000 rows (3 years) — negligible
- Refresh tokens: ~10,000 rows (with cleanup) — negligible
- Audit log: ~500K rows/year — partition by month if needed

---

### 1.3 Geometry Schema

```sql
-- ============================================================
-- SCHEMA: geometry
-- Owner: Geometry Module
-- Requires: PostGIS extension
-- ============================================================

CREATE SCHEMA IF NOT EXISTS geometry;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── Features ─────────────────────────────────────────────────
CREATE TABLE geometry.features (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    geometry_type       VARCHAR(20) NOT NULL,         -- Point | LineString | Polygon
    geometry            GEOMETRY(Geometry, 4326) NOT NULL,  -- WGS84 (EPSG:4326)
    properties          JSONB NOT NULL DEFAULT '{}',
    tags                TEXT[] DEFAULT '{}',
    current_version     INTEGER NOT NULL DEFAULT 1,
    bbox                BOX2D GENERATED ALWAYS AS (
                            Box2D(geometry)
                        ) STORED,
    created_by          UUID NOT NULL,                 -- references identity.users
    updated_by          UUID NOT NULL,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT features_type_check CHECK (
        geometry_type IN ('Point', 'LineString', 'Polygon')
    ),
    CONSTRAINT features_name_length CHECK (
        LENGTH(name) >= 1 AND LENGTH(name) <= 255
    ),
    CONSTRAINT features_geometry_valid CHECK (
        ST_IsValid(geometry)
    ),
    CONSTRAINT features_geometry_srid CHECK (
        ST_SRID(geometry) = 4326
    )
);

-- Spatial index (GiST) — THE most important index in the system
CREATE INDEX idx_features_geometry_gist ON geometry.features
    USING GIST (geometry)
    WHERE is_deleted = FALSE;

-- For listing / filtering
CREATE INDEX idx_features_type ON geometry.features (geometry_type)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_features_created_by ON geometry.features (created_by);
CREATE INDEX idx_features_tags ON geometry.features USING GIN (tags);
CREATE INDEX idx_features_properties ON geometry.features USING GIN (properties jsonb_path_ops);
CREATE INDEX idx_features_updated_at ON geometry.features (updated_at DESC)
    WHERE is_deleted = FALSE;

-- ─── Outbox (Transactional Outbox Pattern) ────────────────────
CREATE TABLE geometry.outbox (
    id              BIGSERIAL PRIMARY KEY,
    event_type      VARCHAR(100) NOT NULL,          -- FeatureCreated | FeatureUpdated | FeatureDeleted
    aggregate_id    UUID NOT NULL,                   -- feature_id
    aggregate_type  VARCHAR(50) NOT NULL DEFAULT 'Feature',
    payload         JSONB NOT NULL,
    correlation_id  UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at    TIMESTAMPTZ,                     -- NULL = not yet published

    CONSTRAINT outbox_event_type_check CHECK (
        event_type IN ('FeatureCreated', 'FeatureUpdated', 'FeatureDeleted', 'FeaturePropertiesChanged')
    )
);

CREATE INDEX idx_outbox_unpublished ON geometry.outbox (created_at)
    WHERE published_at IS NULL;
```

**Index Strategy Rationale**:

| Index | Type | Purpose | Query Pattern |
|-------|------|---------|--------------|
| `idx_features_geometry_gist` | GiST | Spatial queries: intersect, contains, distance, bbox | `WHERE ST_Intersects(geometry, ?)` |
| `idx_features_type` | B-tree (partial) | Filter by geometry type | `WHERE geometry_type = 'Polygon'` |
| `idx_features_tags` | GIN | Tag-based search | `WHERE tags @> ARRAY['infrastructure']` |
| `idx_features_properties` | GIN (jsonb_path_ops) | Property filtering | `WHERE properties @> '{"status": "active"}'` |
| `idx_features_updated_at` | B-tree (partial) | Recent features listing | `ORDER BY updated_at DESC` |
| `idx_outbox_unpublished` | B-tree (partial) | Outbox polling | `WHERE published_at IS NULL` |

**Growth Projection**:
- Features: ~50K rows (1 year), ~150K rows (3 years) — moderate
- Outbox: ~5K rows/day — purge after published (30-day retention for replay)
- Spatial index: ~500 MB (1 year) — grows with geometry complexity

---

### 1.4 Versioning Schema

```sql
-- ============================================================
-- SCHEMA: versioning
-- Owner: Versioning Module
-- ============================================================

CREATE SCHEMA IF NOT EXISTS versioning;

-- ─── Versions ─────────────────────────────────────────────────
CREATE TABLE versioning.versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id          UUID NOT NULL,                 -- references geometry.features (cross-schema FK not enforced)
    version_number      INTEGER NOT NULL,
    change_type         VARCHAR(20) NOT NULL,          -- created | updated | deleted | reverted
    
    -- Full snapshot (for fast reconstruction)
    snapshot_geometry    GEOMETRY(Geometry, 4326) NOT NULL, -- full GeoJSON at this version
    snapshot_properties  JSONB NOT NULL DEFAULT '{}',
    snapshot_name        VARCHAR(255) NOT NULL,
    
    -- Diff from previous version (NULL for version 1)
    diff                JSONB,                          -- { addedVertices, removedVertices, movedVertices, etc. }
    
    -- Metadata
    author_id           UUID NOT NULL,                  -- references identity.users
    message             TEXT,                            -- optional commit message
    parent_version_id   UUID REFERENCES versioning.versions(id),
    
    -- Computed stats
    vertex_count        INTEGER,
    area_sqm            DOUBLE PRECISION,               -- for polygons
    length_m            DOUBLE PRECISION,               -- for linestrings
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT versions_feature_version_unique UNIQUE (feature_id, version_number),
    CONSTRAINT versions_change_type_check CHECK (
        change_type IN ('created', 'updated', 'deleted', 'reverted')
    ),
    CONSTRAINT versions_number_positive CHECK (version_number >= 1)
);

-- For timeline queries: "get all versions of feature X, ordered by version"
CREATE INDEX idx_versions_feature_timeline ON versioning.versions (feature_id, version_number DESC);

-- For author activity: "show all changes by user X"
CREATE INDEX idx_versions_author ON versioning.versions (author_id, created_at DESC);

-- For time-based queries: "what changed between date A and date B"
CREATE INDEX idx_versions_created_at ON versioning.versions (created_at DESC);

-- Spatial index on snapshot (for historical spatial queries: "what was here at time T?")
CREATE INDEX idx_versions_snapshot_gist ON versioning.versions
    USING GIST (snapshot_geometry);

-- ─── Changesets ───────────────────────────────────────────────
CREATE TABLE versioning.changesets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id       UUID NOT NULL,
    message         TEXT NOT NULL,
    version_ids     UUID[] NOT NULL,                  -- references versioning.versions
    feature_count   INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_changesets_author ON versioning.changesets (author_id, created_at DESC);

-- ─── Inbox (Idempotent Event Processing) ──────────────────────
CREATE TABLE versioning.inbox (
    event_id        UUID PRIMARY KEY,                  -- from event envelope correlationId
    event_type      VARCHAR(100) NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-purge old inbox entries (keep 7 days for dedup window)
CREATE INDEX idx_inbox_processed ON versioning.inbox (processed_at);
```

**Growth Projection**:
- Versions: ~1.8M rows/year (5K edits/day × 365) — moderate to large
- Snapshot storage: ~50 GB/year (avg 30KB per snapshot)
- Changesets: ~50K rows/year — negligible
- Inbox: purged after 7 days — negligible

---

### 1.5 Tracking Schema (TimescaleDB)

```sql
-- ============================================================
-- SCHEMA: tracking
-- Owner: Tracking Module
-- Requires: TimescaleDB extension
-- ============================================================

CREATE SCHEMA IF NOT EXISTS tracking;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─── Tracking Sessions ────────────────────────────────────────
CREATE TABLE tracking.sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       UUID NOT NULL,
    owner_id        UUID NOT NULL,                     -- references identity.users
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | paused | ended
    
    -- Configuration
    min_interval_ms     INTEGER NOT NULL DEFAULT 1000,
    max_speed_kmh       REAL NOT NULL DEFAULT 200.0,
    accuracy_threshold_m REAL NOT NULL DEFAULT 50.0,
    tracking_mode       VARCHAR(20) NOT NULL DEFAULT 'continuous',  -- continuous | on_move

    -- Stats (updated periodically)
    total_points        BIGINT NOT NULL DEFAULT 0,
    total_distance_m    DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_location_at    TIMESTAMPTZ,
    last_lat            DOUBLE PRECISION,
    last_lng            DOUBLE PRECISION,
    
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT sessions_status_check CHECK (status IN ('active', 'paused', 'ended')),
    CONSTRAINT sessions_mode_check CHECK (tracking_mode IN ('continuous', 'on_move'))
);

CREATE INDEX idx_sessions_device ON tracking.sessions (device_id, status);
CREATE INDEX idx_sessions_owner ON tracking.sessions (owner_id, created_at DESC);
CREATE INDEX idx_sessions_active ON tracking.sessions (device_id)
    WHERE status = 'active';

-- ─── Location Points (TimescaleDB Hypertable) ─────────────────
-- THIS IS THE HIGHEST VOLUME TABLE: up to 50K inserts/sec
CREATE TABLE tracking.location_points (
    time                TIMESTAMPTZ NOT NULL,          -- device timestamp (primary ordering dimension)
    session_id          UUID NOT NULL,
    device_id           UUID NOT NULL,
    
    -- Position
    lat                 DOUBLE PRECISION NOT NULL,
    lng                 DOUBLE PRECISION NOT NULL,
    altitude            REAL,                          -- meters above sea level
    
    -- Motion
    speed               REAL,                          -- meters per second
    bearing             REAL,                          -- degrees (0-360)
    
    -- Quality
    accuracy            REAL,                          -- horizontal accuracy in meters
    
    -- Metadata
    server_timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_filtered         BOOLEAN NOT NULL DEFAULT FALSE, -- rejected by noise filter
    
    -- PostGIS point (for spatial queries on tracking data)
    geom                GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
                            ST_SetSRID(ST_MakePoint(lng, lat), 4326)
                        ) STORED
);

-- Convert to TimescaleDB hypertable (partitioned by time, daily chunks)
SELECT create_hypertable(
    'tracking.location_points',
    'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes on hypertable
CREATE INDEX idx_location_session_time ON tracking.location_points (session_id, time DESC);
CREATE INDEX idx_location_device_time ON tracking.location_points (device_id, time DESC);
CREATE INDEX idx_location_geom ON tracking.location_points USING GIST (geom);

-- ─── Compression Policy ───────────────────────────────────────
-- Compress chunks older than 7 days (10-20x size reduction)
ALTER TABLE tracking.location_points SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id, session_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy(
    'tracking.location_points',
    compress_after => INTERVAL '7 days'
);

-- ─── Retention Policy ─────────────────────────────────────────
-- Drop raw data older than 90 days (aggregates kept longer)
SELECT add_retention_policy(
    'tracking.location_points',
    drop_after => INTERVAL '90 days'
);

-- ─── Continuous Aggregates (Pre-computed Rollups) ──────────────

-- 5-minute aggregate: used for recent tracking display
CREATE MATERIALIZED VIEW tracking.location_5min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', time) AS bucket,
    session_id,
    device_id,
    AVG(lat) AS avg_lat,
    AVG(lng) AS avg_lng,
    AVG(speed) AS avg_speed,
    MAX(speed) AS max_speed,
    AVG(accuracy) AS avg_accuracy,
    COUNT(*) AS point_count,
    MIN(time) AS first_time,
    MAX(time) AS last_time
FROM tracking.location_points
WHERE is_filtered = FALSE
GROUP BY bucket, session_id, device_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('tracking.location_5min',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes'
);

-- 1-hour aggregate: used for historical playback and analytics
CREATE MATERIALIZED VIEW tracking.location_1hr
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    session_id,
    device_id,
    AVG(lat) AS avg_lat,
    AVG(lng) AS avg_lng,
    AVG(speed) AS avg_speed,
    MAX(speed) AS max_speed,
    SUM(speed * 1.0) AS total_distance_estimate,   -- rough estimate
    COUNT(*) AS point_count,
    MIN(time) AS first_time,
    MAX(time) AS last_time
FROM tracking.location_points
WHERE is_filtered = FALSE
GROUP BY bucket, session_id, device_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('tracking.location_1hr',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- ─── Tracks (Segment Summary) ─────────────────────────────────
CREATE TABLE tracking.tracks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES tracking.sessions(id),
    segment_index   INTEGER NOT NULL DEFAULT 0,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    point_count     BIGINT NOT NULL DEFAULT 0,
    distance_m      DOUBLE PRECISION NOT NULL DEFAULT 0,
    bbox            BOX2D,                             -- bounding box of track segment
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tracks_session_segment_unique UNIQUE (session_id, segment_index)
);

CREATE INDEX idx_tracks_session ON tracking.tracks (session_id, segment_index);
```

**TimescaleDB Partitioning Strategy**:

```
location_points hypertable
├── _hyper_1_1_chunk  (2026-04-01 to 2026-04-02)  ← daily chunks
├── _hyper_1_2_chunk  (2026-04-02 to 2026-04-03)
├── _hyper_1_3_chunk  (2026-04-03 to 2026-04-04)
│   ... (7 days of uncompressed data)
├── _hyper_1_8_chunk  (2026-04-08 — compressed)    ← 10-20x smaller
│   ...
├── _hyper_1_90_chunk (auto-dropped after 90 days)
└── Continuous Aggregates (kept for 3 years):
    ├── location_5min  → recent tracking display
    └── location_1hr   → historical analytics
```

**Growth Projection**:

| Time Period | Raw Data | After Compression (7d+) | After Retention (90d) |
|-------------|----------|------------------------|----------------------|
| 1 day | ~57 GB | — | — |
| 1 week | ~400 GB | ~50 GB (compressed) | — |
| 1 month | ~1.7 TB | ~200 GB | — |
| 3 months | — | — | ~200 GB (90d rolling) |
| 1 year | — | — | ~200 GB + 20 GB aggregates |

---

## 2. API Contracts (Contract-First)

### 2.1 API Style Guide

| Rule | Value | Example |
|------|-------|---------|
| Base URL | `/api/v1` | `https://api.geotrack.app/api/v1` |
| Path style | `kebab-case`, plural nouns | `/tracking-sessions`, `/features` |
| Versioning | URL path | `/api/v1/`, `/api/v2/` |
| Pagination | Cursor-based | `?cursor=eyJpZCI6...&limit=50` |
| Error format | RFC 7807 Problem Details | `{ type, title, status, detail, instance }` |
| Date format | ISO 8601 with timezone | `2026-04-07T13:00:00Z` |
| ID format | UUID v4 | `550e8400-e29b-41d4-a716-446655440000` |
| Auth header | Bearer JWT | `Authorization: Bearer eyJhbGci...` |
| Rate limiting headers | Standard | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |

### 2.2 Error Response Standard (RFC 7807)

```json
{
  "type": "https://api.geotrack.app/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "Geometry is self-intersecting at coordinates [106.6297, 10.8231]",
  "instance": "/api/v1/features/550e8400-e29b-41d4-a716-446655440000",
  "errors": [
    {
      "field": "geometry",
      "code": "SELF_INTERSECTING",
      "message": "Polygon has self-intersection"
    }
  ],
  "correlationId": "req-abc123-def456"
}
```

### 2.3 Pagination Response Standard

```json
{
  "data": [ ... ],
  "pagination": {
    "cursor": "eyJpZCI6IjU1MGU4NDAwLi4uIiwiZGlyIjoibmV4dCJ9",
    "hasMore": true,
    "limit": 50,
    "total": 1234
  }
}
```

---

### 2.4 Identity API

```yaml
# ═══════════════════════════════════════════════════
# POST /api/v1/auth/register
# ═══════════════════════════════════════════════════
Request:
  Body:
    email: string (required, valid email)
    password: string (required, min 12 chars)
    displayName: string (required, 1-100 chars)
Response 201:
  { userId, email, displayName, role, createdAt }
Errors:
  400: Validation error (password too short, invalid email)
  409: Email already registered

# ═══════════════════════════════════════════════════
# POST /api/v1/auth/login
# ═══════════════════════════════════════════════════
Request:
  Body:
    email: string (required)
    password: string (required)
Response 200:
  { accessToken, expiresIn, user: { id, email, displayName, role } }
  Set-Cookie: refreshToken (httpOnly, secure, sameSite=strict, path=/api/v1/auth)
Errors:
  401: Invalid credentials
  403: Account suspended
  429: Too many login attempts (rate limited: 5/min per email)

# ═══════════════════════════════════════════════════
# POST /api/v1/auth/refresh
# ═══════════════════════════════════════════════════
Request:
  Cookie: refreshToken
Response 200:
  { accessToken, expiresIn }
  Set-Cookie: new refreshToken (rotation)
Errors:
  401: Invalid or expired refresh token

# ═══════════════════════════════════════════════════
# POST /api/v1/auth/logout
# ═══════════════════════════════════════════════════
Request:
  Cookie: refreshToken
  Authorization: Bearer <accessToken>
Response 204: No Content
  Clear-Cookie: refreshToken

# ═══════════════════════════════════════════════════
# GET /api/v1/auth/me
# ═══════════════════════════════════════════════════
Auth: Required
Response 200:
  { id, email, displayName, role, lastLoginAt, createdAt }

# ═══════════════════════════════════════════════════
# GET /api/v1/users (Admin only)
# ═══════════════════════════════════════════════════
Auth: admin
Query: ?status=active&cursor=...&limit=50
Response 200:
  { data: [{ id, email, displayName, role, status, lastLoginAt }], pagination }

# ═══════════════════════════════════════════════════
# PATCH /api/v1/users/:id/role (Admin only)
# ═══════════════════════════════════════════════════
Auth: admin
Request:
  Body: { role: "viewer" | "editor" | "admin" }
Response 200:
  { id, email, role, updatedAt }
Errors:
  403: Cannot change own role / cannot demote last admin
```

---

### 2.5 Geometry (Features) API

```yaml
# ═══════════════════════════════════════════════════
# POST /api/v1/features
# ═══════════════════════════════════════════════════
Auth: editor, admin
Request:
  Body:
    name: string (required, 1-255 chars)
    description?: string
    geometryType: "Point" | "LineString" | "Polygon" (required)
    geometry: GeoJSON Geometry object (required)
    properties?: object
    tags?: string[]
Response 201:
  {
    id, name, description, geometryType,
    geometry: { type, coordinates },
    properties, tags,
    currentVersion: 1,
    createdBy, createdAt, updatedAt
  }
Errors:
  400: Invalid GeoJSON / self-intersecting polygon / coordinates out of range
  401: Not authenticated
  403: Insufficient role (viewer cannot create)

# ═══════════════════════════════════════════════════
# GET /api/v1/features
# ═══════════════════════════════════════════════════
Auth: viewer, editor, admin
Query:
  ?bbox=minLng,minLat,maxLng,maxLat     (bounding box filter)
  &geometryType=Polygon                  (type filter)
  &tags=infrastructure,water             (tag filter, AND logic)
  &createdBy=<userId>                    (author filter)
  &cursor=...                            (pagination)
  &limit=50                              (default 50, max 200)
  &sort=updatedAt                        (updatedAt | createdAt | name)
  &order=desc                            (asc | desc)
Response 200:
  {
    data: [{ id, name, geometryType, geometry, properties, tags, currentVersion, ... }],
    pagination: { cursor, hasMore, limit, total }
  }

# ═══════════════════════════════════════════════════
# GET /api/v1/features/:id
# ═══════════════════════════════════════════════════
Auth: viewer, editor, admin
Response 200:
  { id, name, description, geometryType, geometry, properties, tags,
    currentVersion, createdBy, updatedBy, createdAt, updatedAt }
Errors:
  404: Feature not found (or soft-deleted)

# ═══════════════════════════════════════════════════
# PUT /api/v1/features/:id
# ═══════════════════════════════════════════════════
Auth: editor (own or assigned), admin
Request:
  Body:
    name?: string
    description?: string
    geometry?: GeoJSON Geometry object
    properties?: object
    tags?: string[]
    expectedVersion: integer (required — optimistic locking)
Response 200:
  { id, name, geometry, currentVersion, updatedBy, updatedAt }
Errors:
  400: Invalid geometry
  404: Feature not found
  409: Version conflict { currentVersion, yourVersion }

# ═══════════════════════════════════════════════════
# DELETE /api/v1/features/:id
# ═══════════════════════════════════════════════════
Auth: admin only
Request:
  Body:
    expectedVersion: integer (required)
Response 204: No Content (soft delete)
Errors:
  404: Feature not found
  409: Version conflict

# ═══════════════════════════════════════════════════
# POST /api/v1/features/:id/buffer
# ═══════════════════════════════════════════════════
Auth: viewer, editor, admin
Request:
  Body:
    distanceMeters: number (required, > 0, max 100000)
Response 200:
  {
    sourceFeatureId, distanceMeters,
    resultGeometry: { type: "Polygon", coordinates: [...] }
  }

# ═══════════════════════════════════════════════════
# POST /api/v1/spatial/query
# ═══════════════════════════════════════════════════
Auth: viewer, editor, admin
Request:
  Body:
    operation: "intersects" | "contains" | "within" | "within_distance"
    queryGeometry: GeoJSON Geometry object (required)
    params?:
      distanceMeters?: number  (for within_distance)
      geometryType?: string    (filter result type)
    cursor?: string
    limit?: number (default 50, max 200)
Response 200:
  {
    operation, resultCount,
    data: [{ id, name, geometryType, geometry, distance? }],
    pagination, executionTimeMs
  }
Errors:
  400: Invalid query geometry / unsupported operation
  408: Query timeout (> 10s)
```

---

### 2.6 Versioning API

```yaml
# ═══════════════════════════════════════════════════
# GET /api/v1/features/:id/versions
# ═══════════════════════════════════════════════════
Auth: viewer, editor, admin
Query:
  ?cursor=...&limit=50
  &from=2026-01-01T00:00:00Z            (time range filter)
  &to=2026-04-07T00:00:00Z
Response 200:
  {
    featureId,
    data: [{
      id, versionNumber, changeType,
      author: { id, displayName },
      message,
      vertexCount, areaSqm, lengthM,
      createdAt
    }],
    pagination
  }

# ═══════════════════════════════════════════════════
# GET /api/v1/features/:id/versions/:versionNumber
# ═══════════════════════════════════════════════════
Auth: viewer, editor, admin
Response 200:
  {
    id, featureId, versionNumber, changeType,
    snapshot: {
      geometry: { type, coordinates },
      properties, name
    },
    diff: {
      addedVertices, removedVertices, movedVertices,
      propertiesChanged, areaDelta, perimeterDelta
    },
    author: { id, displayName },
    message, createdAt
  }
Errors:
  404: Version not found

# ═══════════════════════════════════════════════════
# GET /api/v1/features/:id/versions/:v1/diff/:v2
# ═══════════════════════════════════════════════════
Auth: viewer, editor, admin
Response 200:
  {
    featureId, fromVersion: v1, toVersion: v2,
    diff: {
      addedVertices, removedVertices, movedVertices,
      propertiesChanged,
      geometryTypeChanged: boolean,
      areaDelta, perimeterDelta
    },
    fromSnapshot: { geometry, properties },
    toSnapshot: { geometry, properties }
  }

# ═══════════════════════════════════════════════════
# POST /api/v1/features/:id/revert
# ═══════════════════════════════════════════════════
Auth: editor (own features), admin
Request:
  Body:
    toVersion: integer (required — version number to revert to)
    message?: string
Response 201:
  {
    featureId, newVersion, revertedFromVersion,
    snapshot: { geometry, properties, name }
  }
Errors:
  400: Cannot revert to current version / version does not exist
  404: Feature not found
  409: Conflict (concurrent edit)

# ═══════════════════════════════════════════════════
# GET /api/v1/features/:id/timeline
# ═══════════════════════════════════════════════════
# Optimized endpoint for time slider UI
Auth: viewer, editor, admin
Query:
  ?from=2026-01-01T00:00:00Z
  &to=2026-04-07T00:00:00Z
  &granularity=version | hour | day     (aggregation level)
Response 200:
  {
    featureId,
    timeRange: { from, to },
    entries: [{
      timestamp, versionNumber?,
      geometry: { type, coordinates },
      changeType, authorId
    }]
  }
```

---

### 2.7 Tracking API

```yaml
# ═══════════════════════════════════════════════════
# POST /api/v1/tracking-sessions
# ═══════════════════════════════════════════════════
Auth: editor, admin
Request:
  Body:
    deviceId: UUID (required)
    config?:
      minIntervalMs?: integer (default 1000, min 100)
      maxSpeedKmh?: number (default 200)
      accuracyThresholdM?: number (default 50)
      trackingMode?: "continuous" | "on_move" (default "continuous")
Response 201:
  {
    id, deviceId, status: "active", config,
    apiKey: "<generated-api-key>",    ← device uses this for ingestion
    startedAt
  }
Errors:
  400: Validation error
  409: Device already has active session

# ═══════════════════════════════════════════════════
# GET /api/v1/tracking-sessions
# ═══════════════════════════════════════════════════
Auth: viewer (own), admin (all)
Query:
  ?status=active|ended
  &deviceId=<uuid>
  &cursor=...&limit=50
Response 200:
  { data: [{ id, deviceId, status, totalPoints, totalDistanceM, ... }], pagination }

# ═══════════════════════════════════════════════════
# GET /api/v1/tracking-sessions/:id
# ═══════════════════════════════════════════════════
Auth: owner, admin
Response 200:
  {
    id, deviceId, ownerId, status, config,
    totalPoints, totalDistanceM,
    lastLocation: { lat, lng, timestamp },
    startedAt, endedAt
  }

# ═══════════════════════════════════════════════════
# PATCH /api/v1/tracking-sessions/:id/end
# ═══════════════════════════════════════════════════
Auth: owner, admin
Response 200:
  { id, status: "ended", endedAt, totalPoints, totalDistanceM }

# ═══════════════════════════════════════════════════
# POST /api/v1/tracking/ingest
# ═══════════════════════════════════════════════════
# HIGH-THROUGHPUT ENDPOINT — separate from main API
Auth: API Key (from session creation)
Request:
  Body:
    sessionId: UUID (required)
    points: [{
      lat: number (required, -90 to 90)
      lng: number (required, -180 to 180)
      altitude?: number
      speed?: number (m/s)
      bearing?: number (0-360)
      accuracy?: number (meters)
      timestamp: ISO8601 string (required — device timestamp)
    }]                                  ← batch of 1-100 points
Response 202: Accepted
  { accepted: number, queued: true }
Errors:
  400: Validation error (invalid coordinates, missing timestamp)
  401: Invalid API key
  404: Session not found or ended
  429: Rate limited (max 10 requests/sec per device)

# ═══════════════════════════════════════════════════
# GET /api/v1/tracking-sessions/:id/locations
# ═══════════════════════════════════════════════════
# For history playback
Auth: owner, admin
Query:
  ?from=2026-04-07T08:00:00Z
  &to=2026-04-07T17:00:00Z
  &resolution=raw|5min|1hr             (aggregate level)
  &cursor=...&limit=1000
Response 200:
  {
    sessionId, timeRange: { from, to }, resolution,
    data: [{
      timestamp, lat, lng, altitude,
      speed, bearing, accuracy
    }],
    pagination
  }

# ═══════════════════════════════════════════════════
# GET /api/v1/tracking-sessions/:id/trail
# ═══════════════════════════════════════════════════
# Returns GeoJSON LineString for map rendering
Auth: owner, admin
Query:
  ?from=2026-04-07T08:00:00Z
  &to=2026-04-07T17:00:00Z
  &simplify=true                        (Douglas-Peucker simplification)
  &tolerance=0.0001                     (simplification tolerance in degrees)
Response 200:
  {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[lng, lat], ...] },
    properties: {
      sessionId, pointCount, distanceM,
      startTime, endTime, avgSpeedMs
    }
  }
```

---

## 3. Event Schemas

### 3.1 Event Envelope Standard

```typescript
// Every event follows this envelope structure
interface EventEnvelope<T = unknown> {
  // Identity
  eventId: string;          // UUID v4 — globally unique
  eventType: string;        // e.g., "FeatureCreated", "LocationReceived"
  schemaVersion: number;    // starts at 1, increment on breaking change

  // Source
  source: string;           // e.g., "geometry-module", "tracking-ingestion"
  correlationId: string;    // UUID — traces request across services
  causationId?: string;     // eventId of the event that caused this one

  // Metadata
  timestamp: string;        // ISO 8601, server time
  userId?: string;          // UUID of the user who triggered the action
  
  // Payload
  payload: T;               // event-specific data
}
```

### 3.2 Event Payload Schemas

```typescript
// ─── Geometry Events ──────────────────────────────────────────

interface FeatureCreatedPayload {
  featureId: string;
  name: string;
  geometryType: 'Point' | 'LineString' | 'Polygon';
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
  tags: string[];
  createdBy: string;
}

interface FeatureUpdatedPayload {
  featureId: string;
  previousVersion: number;
  newVersion: number;
  geometry: GeoJSON.Geometry;         // new geometry
  previousGeometry: GeoJSON.Geometry; // old geometry (for diff computation)
  properties: Record<string, unknown>;
  updatedBy: string;
}

interface FeatureDeletedPayload {
  featureId: string;
  lastVersion: number;
  deletedBy: string;
}

// ─── Versioning Events ────────────────────────────────────────

interface VersionCreatedPayload {
  versionId: string;
  featureId: string;
  versionNumber: number;
  changeType: 'created' | 'updated' | 'deleted' | 'reverted';
  authorId: string;
}

// ─── Tracking Events ──────────────────────────────────────────

interface LocationReceivedPayload {
  sessionId: string;
  deviceId: string;
  lat: number;
  lng: number;
  altitude?: number;
  speed?: number;
  bearing?: number;
  accuracy?: number;
  deviceTimestamp: string;  // ISO 8601
}

interface SessionStartedPayload {
  sessionId: string;
  deviceId: string;
  ownerId: string;
  config: SessionConfig;
}

interface SessionEndedPayload {
  sessionId: string;
  deviceId: string;
  reason: 'user_ended' | 'timeout' | 'admin_ended';
  totalPoints: number;
  totalDistanceM: number;
}
```

### 3.3 Topic Catalog

| Topic | Partitions | Partition Key | Retention | Publishers | Consumers |
|-------|:----------:|--------------|:---------:|-----------|-----------|
| `tracking.location.raw` | 16 | `deviceId` | 24 hours | Tracking Ingestion | Tracking Consumer |
| `geometry.events` | 4 | `featureId` | 7 days | Geometry Module | Versioning Module, Realtime Gateway |
| `tracking.session.events` | 4 | `sessionId` | 7 days | Tracking Module | Realtime Gateway |
| `tracking.location.dlq` | 1 | — | 30 days | Tracking Consumer | Manual replay |
| `geometry.events.dlq` | 1 | — | 30 days | Versioning Module | Manual replay |

**Partition Key Design**:
- `tracking.location.raw` partitioned by `deviceId` → guarantees ordering per device
- `geometry.events` partitioned by `featureId` → guarantees ordering per feature (version sequence)

### 3.4 Schema Evolution Rules

| Change Type | Allowed? | Action Required |
|-------------|:--------:|-----------------|
| Add optional field | ✅ Yes | Increment `schemaVersion` |
| Add required field | ⚠️ With default | Increment `schemaVersion`, consumers must handle missing |
| Remove field | ❌ No | Create new event type instead |
| Rename field | ❌ No | Add new field, deprecate old |
| Change field type | ❌ No | Create new event type |

---

## 4. Outbox & Inbox DDL

### 4.1 Outbox Pattern (already defined in geometry schema)

```sql
-- See geometry.outbox in Section 1.3
-- Outbox processor workflow:
-- 1. Poll: SELECT * FROM geometry.outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 100
-- 2. Publish each event to Kafka topic
-- 3. UPDATE geometry.outbox SET published_at = NOW() WHERE id = <id>
-- 4. Cleanup: DELETE FROM geometry.outbox WHERE published_at < NOW() - INTERVAL '30 days'
```

### 4.2 Inbox Pattern (already defined in versioning schema)

```sql
-- See versioning.inbox in Section 1.4
-- Inbox consumer workflow:
-- 1. Receive event from Kafka
-- 2. Check: SELECT 1 FROM versioning.inbox WHERE event_id = <eventId>
-- 3. If exists → skip (already processed) → ACK
-- 4. If not exists:
--    BEGIN TRANSACTION
--    INSERT INTO versioning.inbox (event_id, event_type)
--    Process event (create version, compute diff)
--    COMMIT
--    ACK to Kafka
-- 5. Cleanup: DELETE FROM versioning.inbox WHERE processed_at < NOW() - INTERVAL '7 days'
```

---

## ✅ Phase 3 Done Criteria Checklist

| Criterion | Status |
|-----------|--------|
| ER diagrams for all modules with indexes | ✅ 4 schemas, 20+ indexes |
| Storage type matrix (module → technology) | ✅ Complete |
| OpenAPI-style specs for all endpoints | ✅ 20+ endpoints defined |
| All endpoints have auth, pagination, error responses | ✅ Complete |
| Event envelope schema defined | ✅ TypeScript interface |
| Topic catalog complete with partition keys | ✅ 5 topics |
| Outbox + Inbox DDL ready | ✅ With workflow descriptions |
| API style guide | ✅ 9 rules |
| Growth projections per table | ✅ All tables |

---

## Connection to Next Phase

**Phase 4: System Flows & Tech Stack** will use:
- **API contracts** → trace full HTTP request flow from client to database
- **Event schemas** → trace event flow from outbox to consumer
- **Data models** → validate data flow consistency
- **Index strategy** → verify query patterns are supported
- **Topic catalog** → design Kafka configuration

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review this document + API contracts

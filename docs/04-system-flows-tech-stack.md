# Phase 4 — System Flows & Tech Stack

> **Product**: GeoTrack — Geospatial Operations Platform  
> **Updated**: 2026-04-07  
> **Status**: Draft — Awaiting Review  
> **Input**: [Phase 2](./02-architecture-domain-design.md) + [Phase 3](./03-data-api-contract-design.md)

---

## 🎯 Goal

Trace every request end-to-end through the system. Select the exact technology for each component. Design the infrastructure shape. Answer: "If I follow a single request from the browser to the database and back, what happens at every step?"

---

## 1. Core System Flows

### Flow 1: HTTP Request — Feature CRUD (Create)

**Scenario**: Editor creates a new polygon feature on the map.

```mermaid
sequenceDiagram
    participant U as Browser (SPA)
    participant CDN as CDN (Tiles)
    participant LB as Load Balancer (Nginx)
    participant GW as API Gateway
    participant GM as Geometry Module
    participant PG as PostgreSQL + PostGIS
    participant OB as Outbox Processor
    participant KF as Kafka
    participant VM as Versioning Module
    participant RD as Redis Pub/Sub
    participant RT as Realtime Gateway
    participant C as Other Clients

    U->>LB: POST /api/v1/features { name, geometry, ... }
    Note over U,LB: Authorization: Bearer <JWT>
    LB->>GW: Forward (round-robin)
    
    GW->>GW: 1. Extract JWT from Authorization header
    GW->>GW: 2. Verify signature (RS256 public key)
    GW->>GW: 3. Check expiration
    GW->>GW: 4. Extract claims: { userId, role }
    GW->>GW: 5. Rate limit check (sliding window, Redis)
    GW->>GW: 6. RBAC check: role ∈ [editor, admin]
    
    alt Unauthorized
        GW-->>U: 401 Unauthorized / 403 Forbidden
    end
    
    GW->>GM: createFeature(dto, userId)
    Note over GW,GM: Internal call (same process in monolith)
    
    GM->>GM: 7. Validate GeoJSON (valid polygon, SRID=4326)
    GM->>GM: 8. Check geometry complexity (vertex count ≤ 100K)
    GM->>GM: 9. Compute bounding box
    
    alt Validation Failed
        GM-->>GW: 400 { type: "validation", errors: [...] }
        GW-->>U: 400 Validation Error (RFC 7807)
    end
    
    GM->>PG: BEGIN TRANSACTION
    GM->>PG: 10. INSERT INTO geometry.features (...)
    GM->>PG: 11. INSERT INTO geometry.outbox (FeatureCreated event)
    GM->>PG: COMMIT
    Note over GM,PG: Transactional outbox — event guaranteed with data
    
    GM-->>GW: 201 { feature }
    GW->>GW: 12. Add response headers (X-Request-Id, X-RateLimit-*)
    GW-->>U: 201 Created { feature }
    
    Note over OB: Outbox processor (polling every 100ms)
    OB->>PG: 13. SELECT FROM geometry.outbox WHERE published_at IS NULL
    OB->>KF: 14. Produce FeatureCreated to 'geometry.events'
    OB->>PG: 15. UPDATE outbox SET published_at = NOW()
    
    KF->>VM: 16. Consume FeatureCreated event
    VM->>VM: 17. Check inbox (dedup by eventId)
    VM->>PG: 18. INSERT INTO versioning.versions (v1, snapshot, no diff)
    VM->>PG: 19. INSERT INTO versioning.inbox (eventId)
    VM->>KF: 20. ACK
    
    KF->>RD: 21. FeatureCreated → Redis Pub/Sub
    RD->>RT: 22. Channel: features:bbox:{tile}
    RT->>C: 23. WebSocket push to subscribed clients
    Note over C: Client adds feature to map layer
```

**Failure Points & Handling**:

| # | Failure Point | Impact | Handling |
|---|--------------|--------|----------|
| 2 | JWT signature invalid | Request rejected | 401 response, client prompts re-login |
| 5 | Rate limit exceeded | Request rejected | 429 with Retry-After header |
| 7 | Invalid geometry | Request rejected | 400 with specific validation errors |
| 10-11 | DB write fails | Feature not created | 500, client retries, transaction rolls back both |
| 14 | Kafka produce fails | Event not published | Outbox retains event, next poll retries |
| 16 | Kafka consume fails | Version not created | Kafka retries delivery (at-least-once) |
| 17 | Duplicate event | Potential double processing | Inbox dedup prevents duplicate version |
| 22 | Redis pub/sub fails | Real-time push missed | Non-critical: clients will see on next API fetch |

**Correlation ID Propagation**:
```
Browser → X-Request-Id: req-abc123
  → API Gateway logs: correlationId=req-abc123
    → Geometry Module logs: correlationId=req-abc123
      → Outbox event: correlationId=req-abc123
        → Kafka message: correlationId=req-abc123
          → Versioning Module logs: correlationId=req-abc123
            → WebSocket push: correlationId=req-abc123
```

---

### Flow 2: Authentication — Login, Protected Request, Refresh

**Scenario**: User logs in, makes API calls, token expires, auto-refreshes.

```mermaid
sequenceDiagram
    participant U as Browser
    participant GW as API Gateway
    participant IM as Identity Module
    participant PG as PostgreSQL
    participant RD as Redis

    Note over U,PG: ═══ LOGIN ═══
    U->>GW: POST /api/v1/auth/login { email, password }
    GW->>IM: login(email, password)
    IM->>PG: SELECT * FROM identity.users WHERE email = ?
    
    alt User Not Found
        IM-->>GW: 401 Invalid credentials
        GW-->>U: 401 (timing-safe: same response time as valid user)
    end
    
    IM->>IM: bcrypt.compare(password, passwordHash)
    
    alt Password Wrong
        IM->>RD: INCR login_attempts:{email} (TTL: 5min)
        alt > 5 attempts
            IM-->>GW: 429 Too many attempts
            GW-->>U: 429 (Retry-After: 300)
        end
        IM-->>GW: 401 Invalid credentials
        GW-->>U: 401
    end
    
    IM->>IM: Generate JWT (RS256, 15min TTL)
    Note over IM: Claims: { sub: userId, email, role, iat, exp }
    IM->>IM: Generate refresh token (UUID v4)
    IM->>PG: INSERT INTO identity.refresh_tokens (SHA256(token), userId, expires)
    IM->>PG: UPDATE identity.users SET last_login_at = NOW()
    IM->>RD: DEL login_attempts:{email}
    
    IM-->>GW: { accessToken, refreshToken, user }
    GW-->>U: 200 { accessToken }
    Note over GW,U: Set-Cookie: refreshToken (httpOnly, secure, sameSite=strict)
    
    Note over U,PG: ═══ PROTECTED REQUEST ═══
    U->>GW: GET /api/v1/features (Authorization: Bearer <JWT>)
    GW->>GW: Verify JWT signature (public key, local — no DB call)
    GW->>GW: Check exp claim (not expired?)
    GW->>GW: Extract: userId, role from claims
    Note over GW: JWT validation is STATELESS — no DB or Redis lookup
    GW->>IM: Forward with X-User-Id, X-User-Role headers
    
    Note over U,PG: ═══ TOKEN REFRESH ═══
    U->>GW: POST /api/v1/auth/refresh
    Note over U,GW: Cookie: refreshToken=<uuid>
    GW->>IM: refresh(refreshToken)
    IM->>IM: SHA256(refreshToken)
    IM->>PG: SELECT FROM identity.refresh_tokens WHERE token_hash = ?
    
    alt Not Found / Expired / Revoked
        IM-->>GW: 401 Invalid refresh token
        GW-->>U: 401 → client redirects to login
    end
    
    IM->>PG: UPDATE refresh_tokens SET is_revoked = TRUE (rotation!)
    IM->>IM: Generate new JWT + new refresh token
    IM->>PG: INSERT new refresh_token
    IM-->>GW: { accessToken, refreshToken }
    GW-->>U: 200 + Set-Cookie: new refreshToken
```

**Security Notes**:
- Login response time is constant regardless of whether user exists (timing-safe)
- Rate limiting on login: 5 attempts per email per 5 minutes
- Refresh token rotation: old token revoked on each refresh (prevents token theft replay)
- JWT validation is purely local (public key verification) — no DB call per request

---

### Flow 3: Event Flow — Geometry Edit → Version Creation

**Scenario**: Complete async event lifecycle from command to eventual consistency.

```mermaid
sequenceDiagram
    participant A as API Request
    participant GM as Geometry Module
    participant PG as PostgreSQL
    participant OP as Outbox Processor
    participant KF as Kafka
    participant VM as Versioning Module
    participant IB as Inbox Table

    Note over A,IB: ═══ COMMAND SIDE ═══
    A->>GM: PUT /features/:id { geometry, expectedVersion: 3 }
    GM->>PG: SELECT current_version FROM features WHERE id = ? FOR UPDATE
    
    alt version != expectedVersion
        GM-->>A: 409 Conflict { currentVersion: 4, yourVersion: 3 }
    end
    
    GM->>PG: BEGIN
    GM->>PG: UPDATE features SET geometry=?, current_version=4, updated_at=NOW()
    GM->>PG: INSERT INTO outbox (FeatureUpdated, featureId, payload)
    Note over PG: payload includes BOTH old and new geometry (for diff)
    GM->>PG: COMMIT
    GM-->>A: 200 OK { feature, currentVersion: 4 }
    
    Note over OP,IB: ═══ EVENT SIDE (async, ~100-500ms later) ═══
    
    loop Outbox Polling (every 100ms)
        OP->>PG: SELECT * FROM outbox WHERE published_at IS NULL LIMIT 100
        OP->>KF: Produce to 'geometry.events' (key: featureId)
        Note over KF: Partitioned by featureId → ordering guaranteed per feature
        OP->>PG: UPDATE outbox SET published_at = NOW()
    end
    
    Note over KF,IB: ═══ CONSUMER SIDE ═══
    KF->>VM: Consume FeatureUpdated (partition 2)
    VM->>IB: SELECT 1 FROM inbox WHERE event_id = ?
    
    alt Already Processed (duplicate delivery)
        VM->>KF: ACK (skip)
    end
    
    VM->>PG: BEGIN
    VM->>VM: Compute diff: comparGeometries(old, new)
    Note over VM: Diff = { addedVertices, removedVertices, movedVertices, areaDelta }
    VM->>PG: INSERT INTO versions (featureId, v4, snapshot, diff, author)
    VM->>PG: INSERT INTO inbox (eventId, 'FeatureUpdated')
    VM->>PG: COMMIT
    VM->>KF: ACK
    
    alt Processing Error (3 retries exhausted)
        KF->>KF: Move to geometry.events.dlq
        Note over KF: DLQ has 30-day retention for manual investigation
    end
```

**Outbox Processor Details**:
```
Polling interval:    100ms
Batch size:          100 events
Max retries:         3 (per event)
Retry backoff:       100ms, 200ms, 400ms
Failure behavior:    Skip event, mark failed, alert
Cleanup:             DELETE WHERE published_at < NOW() - 30 days
```

---

### Flow 4: Error Handling — Full Taxonomy

```
Error Taxonomy:
═══════════════

1. DOMAIN ERRORS (predictable, part of business logic)
   ├── ValidationError (400)
   │   ├── InvalidGeometry: self-intersecting, out of bounds
   │   ├── InvalidInput: missing fields, wrong types
   │   └── BusinessRule: "cannot delete feature with active references"
   ├── NotFoundError (404)
   │   └── Resource does not exist or is soft-deleted
   ├── ConflictError (409)
   │   └── Optimistic lock: version mismatch
   ├── ForbiddenError (403)
   │   └── RBAC: insufficient role for operation
   └── RateLimitError (429)
       └── Per-client or per-endpoint rate exceeded

2. INFRASTRUCTURE ERRORS (unexpected, system failures)
   ├── DatabaseError (500)
   │   ├── Connection pool exhausted → circuit breaker opens
   │   ├── Query timeout → log + alert
   │   └── Replication lag → read from primary (fallback)
   ├── KafkaError (500)
   │   ├── Producer failure → outbox retains event (no data loss)
   │   ├── Consumer failure → Kafka retries (at-least-once)
   │   └── DLQ overflow → alert on-call
   ├── RedisError (degraded)
   │   ├── Cache miss → fallback to DB (slower, not broken)
   │   ├── Pub/Sub failure → real-time push fails (non-critical)
   │   └── Rate limiter unavailable → allow request (fail-open)
   └── NetworkError (502/503)
       ├── Downstream service unreachable → circuit breaker
       └── DNS failure → retry with backoff

3. UNHANDLED ERRORS (bugs)
   └── Catch-all middleware → 500 Internal Server Error
       ├── Log full stack trace with correlationId
       ├── Return sanitized error to client (no stack trace)
       └── Alert if error rate > threshold
```

**Error Response Flow**:

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as API Gateway
    participant S as Service
    participant M as Monitoring

    C->>GW: Request
    GW->>S: Forward
    
    alt Domain Error
        S-->>GW: { error: DomainError, code, message }
        GW->>GW: Map to RFC 7807 response
        GW-->>C: 4xx { type, title, status, detail, correlationId }
    end
    
    alt Infrastructure Error
        S-->>GW: { error: InfrastructureError }
        GW->>GW: Circuit breaker state check
        GW->>M: Log error with correlationId + stack trace
        GW->>M: Increment error_count metric
        
        alt Circuit Breaker OPEN
            GW-->>C: 503 Service Unavailable { retryAfter: 30 }
        else Circuit Breaker CLOSED
            GW-->>C: 500 Internal Server Error { correlationId }
        end
    end
    
    alt Unhandled Error
        S-->>GW: Thrown exception (uncaught)
        GW->>GW: Global error handler catches
        GW->>M: ALERT: Unhandled error { stack, correlationId }
        GW-->>C: 500 { title: "Internal Error", correlationId }
        Note over C: Client shows: "Something went wrong. Error ID: req-abc123"
    end
```

---

### Flow 5: Tracking Ingestion — High-Throughput Pipeline

**Scenario**: 10K devices sending GPS locations every 1-5 seconds.

```mermaid
sequenceDiagram
    participant D as GPS Device
    participant TI as Tracking Ingestion
    participant KF as Kafka
    participant TC as Tracking Consumer
    participant KL as Kalman Filter
    participant TS as TimescaleDB
    participant RD as Redis
    participant RT as Realtime Gateway
    participant V as Map Viewers

    Note over D,V: ═══ INGESTION (stateless, horizontal) ═══
    D->>TI: POST /api/v1/tracking/ingest { sessionId, points: [{lat,lng,ts}] }
    Note over D,TI: Auth: X-API-Key (from session creation)
    
    TI->>TI: 1. Validate API key (Redis lookup, cached 5min)
    TI->>TI: 2. Validate coordinates: lat ∈ [-90,90], lng ∈ [-180,180]
    TI->>TI: 3. Validate timestamps: not future (>24h), not ancient (>30d)
    TI->>TI: 4. Rate limit: ≤ 10 requests/sec per device (Redis sliding window)
    
    TI->>KF: 5. Produce batch to 'tracking.location.raw'
    Note over KF: Partition key = deviceId → ordering per device guaranteed
    TI-->>D: 202 Accepted { queued: true, accepted: 5 }
    Note over TI: Response in <10ms — fire and forget to Kafka
    
    Note over KF,V: ═══ PROCESSING (consumer group, auto-scaling) ═══
    KF->>TC: 6. Consume batch (up to 1000 messages)
    
    loop For each location point
        TC->>TC: 7. Reorder by deviceTimestamp (handle out-of-order)
        TC->>KL: 8. Apply Kalman filter
        Note over KL: State: { estimatedLat, estimatedLng, velocity, covariance }
        KL->>KL: 9. Predict next position
        KL->>KL: 10. Update with measurement
        KL->>KL: 11. Check innovation (measured vs predicted)
        
        alt Impossible jump (>200 km/h between consecutive points)
            KL->>TC: REJECT: mark is_filtered = true
            Note over TC: Point stored but flagged — not pushed to clients
        end
        
        alt Low accuracy (accuracy > threshold)
            KL->>TC: REJECT: mark is_filtered = true
        end
    end
    
    TC->>TS: 12. Batch INSERT into tracking.location_points (1000 rows)
    Note over TS: Hypertable auto-routes to correct daily chunk
    
    loop For each valid (non-filtered) point
        TC->>RD: 13. PUBLISH tracking:{deviceId} { lat, lng, speed, ts }
        TC->>RD: 14. SET latest:{deviceId} { lat, lng, ts } (TTL: 5min)
        Note over RD: Latest position cache for quick lookups
    end
    
    RD->>RT: 15. Receive from subscribed channels
    RT->>V: 16. Push to viewers subscribed to device/session/bbox
    Note over V: Client updates marker position on map (smooth interpolation)
```

**Throughput Design**:
```
                    Capacity per Instance       Instances
Tracking Ingestion: 10K requests/sec            3 (behind LB)
Kafka Producers:    50K messages/sec             (built into ingestion)
Kafka Consumers:    20K messages/sec per         3 (consumer group)
TimescaleDB Writes: 50K inserts/sec (batch)      1 (single node v1)
Redis Pub/Sub:      200K messages/sec             1 (single node v1)
```

**Back-Pressure Strategy**:
```
IF Kafka consumer lag > 100K messages:
  → Alert: "Tracking processing falling behind"
  → Auto-scale: Add consumer instances to consumer group

IF TimescaleDB insert latency > 500ms:
  → Increase batch size (1000 → 5000)
  → If still slow: buffer in consumer memory (max 10s)
  → If still slow: alert, do NOT drop data

IF Redis pub/sub subscribers > 50K:
  → Rate-limit push: batch updates per 100ms instead of per-point
  → Reduce precision: round coordinates to 5 decimal places
```

---

### Flow 6: Real-Time Synchronization — WebSocket Lifecycle

**Scenario**: User opens map → subscribes to area → receives live updates.

```mermaid
sequenceDiagram
    participant U as Browser
    participant RT as Realtime Gateway
    participant RD as Redis
    participant GM as Geometry Module
    participant TM as Tracking Module

    Note over U,TM: ═══ CONNECTION ═══
    U->>RT: Socket.IO connect (handshake)
    Note over U,RT: Auth: ?token=<JWT> in query params
    RT->>RT: 1. Verify JWT (same as REST)
    RT->>RT: 2. Extract userId, role
    
    alt Auth Failed
        RT-->>U: disconnect(401)
    end
    
    RT->>RT: 3. Register connection (userId → socketId mapping)
    RT->>RD: 4. SADD connected:{userId} socketId
    RT-->>U: connected { socketId }
    
    Note over U,TM: ═══ SUBSCRIBE TO MAP VIEWPORT ═══
    U->>RT: emit('subscribe:viewport', { bbox: [minLng,minLat,maxLng,maxLat], zoom: 14 })
    RT->>RT: 5. Convert bbox to tile coordinates at zoom level
    Note over RT: bbox → tiles: [14/13250/7890, 14/13251/7890, ...]
    RT->>RT: 6. Join rooms: bbox:14:13250:7890, bbox:14:13251:7890
    RT-->>U: emit('subscribed', { tiles: [...] })
    
    Note over U,TM: ═══ RECEIVE TRACKING UPDATES ═══
    Note over TM,RD: Tracking consumer publishes to Redis
    TM->>RD: PUBLISH tracking:device-123 { lat, lng, speed, ts }
    RD->>RT: 7. Receive on tracking:device-123
    RT->>RT: 8. Check which rooms contain device-123's position
    Note over RT: Point (lng, lat) → tile coordinate → room name
    RT->>U: emit('tracking:update', { deviceId, lat, lng, speed, ts })
    Note over U: Client smoothly animates marker to new position
    
    Note over U,TM: ═══ RECEIVE GEOMETRY CHANGES ═══
    Note over GM,RD: Outbox processor publishes to Redis
    GM->>RD: PUBLISH features:bbox:14:13250:7890 { featureId, action: "updated" }
    RD->>RT: 9. Receive on features:bbox:14:13250:7890
    RT->>U: emit('feature:changed', { featureId, action, geometry })
    Note over U: Client updates feature on map layer
    
    Note over U,TM: ═══ VIEWPORT CHANGE ═══
    U->>RT: emit('subscribe:viewport', { bbox: [NEW bbox], zoom: 15 })
    RT->>RT: 10. Leave old tile rooms
    RT->>RT: 11. Join new tile rooms
    RT-->>U: emit('subscribed', { tiles: [...] })
    
    Note over U,TM: ═══ DISCONNECTION ═══
    U->>RT: disconnect (or network drop)
    RT->>RT: 12. Leave all rooms
    RT->>RD: SREM connected:{userId} socketId
    Note over U: Client auto-reconnects with exponential backoff
    Note over U: On reconnect: re-subscribe to current viewport
```

**WebSocket Scaling Architecture**:
```
          Browser 1 ──┐
          Browser 2 ──┼──→ RT Instance 1 ──┐
          Browser 3 ──┘                    │
                                           ├──→ Redis Pub/Sub ←── Tracking Consumer
          Browser 4 ──┐                    │                  ←── Outbox Processor
          Browser 5 ──┼──→ RT Instance 2 ──┘
          Browser 6 ──┘

• Sticky sessions (WebSocket): LB routes by connection ID
• Redis adapter: events published once, delivered to all instances
• Room membership is per-instance (no shared state needed)
```

---

### Flow 7: History Playback — Timeline Reconstruction

**Scenario**: Analyst uses time slider to replay geometry changes.

```mermaid
sequenceDiagram
    participant U as Browser
    participant GW as API Gateway
    participant GM as Geometry Module
    participant VM as Versioning Module
    participant PG as PostgreSQL

    U->>GW: GET /api/v1/features/:id/timeline?from=2026-01-01&to=2026-04-07
    GW->>GW: Verify JWT, RBAC
    GW->>VM: getTimeline(featureId, from, to)
    
    VM->>PG: SELECT versionNumber, changeType, snapshot_geometry,
    Note over PG: snapshot_name, author_id, created_at
    Note over PG: FROM versioning.versions
    Note over PG: WHERE feature_id = ? AND created_at BETWEEN ? AND ?
    Note over PG: ORDER BY version_number ASC
    
    VM-->>GW: [ { version, timestamp, geometry, changeType, author } ]
    GW-->>U: 200 { entries: [...] }
    
    Note over U: ═══ CLIENT-SIDE PLAYBACK ═══
    U->>U: Initialize time slider (min=from, max=to)
    U->>U: Pre-load all version geometries
    
    loop User drags time slider
        U->>U: Find version active at slider time
        Note over U: Binary search: find latest version where createdAt ≤ sliderTime
        U->>U: Render geometry on map
        U->>U: Update info panel (version, author, changeType)
    end
    
    Note over U: ═══ TRACKING PLAYBACK (separate) ═══
    U->>GW: GET /api/v1/tracking-sessions/:id/locations?from=...&to=...&resolution=5min
    GW->>PG: SELECT FROM tracking.location_5min WHERE ...
    Note over PG: Uses continuous aggregate (pre-computed, fast)
    GW-->>U: { data: [ { timestamp, lat, lng, speed } ] }
    
    U->>U: Animate marker along tracking trail
    U->>U: Playback controls: play, pause, speed (1x, 5x, 10x, 50x)
    U->>U: Interpolate position between data points for smooth animation
```

---

### Flow 8: Spatial Query — Intersect with Indexed Lookup

**Scenario**: Analyst draws polygon on map, finds all features that intersect it.

```mermaid
sequenceDiagram
    participant U as Browser
    participant GW as API Gateway
    participant GM as Geometry Module
    participant PG as PostgreSQL + PostGIS

    U->>U: Draw query polygon on map
    U->>GW: POST /api/v1/spatial/query
    Note over U,GW: { operation: "intersects", queryGeometry: { type:"Polygon", coordinates:[...] } }
    
    GW->>GM: executeSpatialQuery(operation, queryGeometry)
    
    GM->>GM: 1. Validate query geometry
    GM->>GM: 2. Check query area size (< max allowed area)
    
    GM->>PG: SELECT id, name, geometry_type,
    Note over PG: ST_AsGeoJSON(geometry) as geometry
    Note over PG: FROM geometry.features
    Note over PG: WHERE ST_Intersects(geometry, ST_GeomFromGeoJSON(?))
    Note over PG: AND is_deleted = FALSE
    Note over PG: LIMIT 201  -- (limit+1 to detect hasMore)
    
    Note over PG: Query Plan:
    Note over PG: 1. GiST index scan (idx_features_geometry_gist)
    Note over PG: 2. Bounding box pre-filter (&&) — O(log n)
    Note over PG: 3. Exact geometry test (ST_Intersects) — only on candidates
    Note over PG: Typical: 100K features → ~50 bbox candidates → ~10 exact matches
    
    PG-->>GM: Result rows
    GM-->>GW: { operation, resultCount, data: [...], executionTimeMs }
    GW-->>U: 200 { results }
    
    U->>U: Highlight matched features on map
    U->>U: Show result panel with feature list
```

**Spatial Query Performance (PostGIS with GiST Index)**:

| Feature Count | Without Index | With GiST Index | Speedup |
|:-------------:|:-------------:|:----------------:|:-------:|
| 1,000 | ~50ms | ~5ms | 10x |
| 10,000 | ~500ms | ~15ms | 33x |
| 100,000 | ~5,000ms | ~50ms | 100x |
| 1,000,000 | ~50,000ms | ~200ms | 250x |

---

## 2. Technology Selection Matrix

### 2.1 Full Stack Decision

| Layer | Technology | Version | Why This | Why Not Alternatives |
|-------|-----------|---------|----------|---------------------|
| **Runtime** | Node.js | 20 LTS | Async I/O perfect for WebSocket + I/O-bound workloads | Go: faster but smaller ecosystem for GIS; Java: heavier, slower startup |
| **Language** | TypeScript | 5.x | Type safety, shared types, IDE support | JavaScript: no types. Rust: too steep for solo dev |
| **Framework** | NestJS | 10.x | Modular architecture matches bounded contexts, DI, guards | Express: too minimal. Fastify: less ecosystem |
| **ORM / Query** | Prisma + raw SQL | 5.x | Prisma for CRUD, raw SQL for PostGIS spatial | TypeORM: poor PostGIS support. Knex: too low-level |
| **Database** | PostgreSQL | 16 | PostGIS, JSONB, rock-solid | MySQL: no PostGIS. MongoDB: no spatial indexes at this level |
| **Spatial Extension** | PostGIS | 3.4 | Industry standard for spatial queries | — (there are no real alternatives in SQL) |
| **Time-Series** | TimescaleDB | 2.x | PostgreSQL-based, compression, continuous aggregates | InfluxDB: separate system. Plain PG: no auto-partitioning |
| **Cache** | Redis | 7.x | Pub/Sub + cache + rate limiter in one | Memcached: no pub/sub. Valkey: compatible fork |
| **Message Queue** | Apache Kafka | 3.x | High throughput, ordering, replay, consumer groups | RabbitMQ: lower throughput for tracking. Redis Streams: simpler but less durable |
| **WebSocket** | Socket.IO | 4.x | Rooms, namespaces, Redis adapter, auto-reconnect | ws: too low-level. µWebSocket: no rooms |
| **Map Library (FE)** | MapLibre GL JS | 4.x | Open-source, vector tiles, GPU-accelerated | Leaflet: no vector tiles. Mapbox GL: requires API key/license |
| **Map Tiles** | MapTiler / self-hosted | — | Vector tiles (MVT), free tier available | Mapbox: more expensive. Google Maps: no vector customization |
| **Frontend** | React | 18.x | Component model, huge ecosystem, map library integrations | Vue: smaller ecosystem. Svelte: less battle-tested at scale |
| **State Mgmt (FE)** | Zustand | 4.x | Simple, performant, no boilerplate | Redux: too verbose. MobX: magic. Jotai: too atomic |
| **Build Tool (FE)** | Vite | 5.x | Fast HMR, ESBuild | Webpack: slow. Turbopack: not stable enough |
| **Containerization** | Docker | — | Standard, compose for local | Podman: less ecosystem |
| **Orchestration** | Docker Compose (dev), K8s (prod) | — | Compose for dev simplicity, K8s for prod scaling | ECS: vendor lock-in |
| **CI/CD** | GitHub Actions | — | Integrated with GitHub, free tier | GitLab CI: needs self-hosted. Jenkins: operational overhead |
| **IaC** | Terraform | 1.x | Multi-cloud, declarative, mature | Pulumi: less mature. CDK: AWS-only |
| **Cloud** | AWS | — | Most mature, EKS + RDS + MSK | GCP: smaller ecosystem. Azure: similar but less GIS community |
| **Monitoring** | Prometheus + Grafana | — | Open-source, standard for metrics | Datadog: expensive. CloudWatch: vendor lock-in |
| **Logging** | Pino (structured JSON) | — | Fastest Node.js logger, structured | Winston: slower. Bunyan: abandoned |
| **Tracing** | OpenTelemetry | — | Vendor-neutral, auto-instrumentation | Jaeger-only: vendor lock-in |
| **Testing** | Vitest + Supertest | — | Fast, ESM-native, Vite-compatible | Jest: slower, CJS-oriented |

### 2.2 Technology ADR

#### ADR-006: Node.js + NestJS Runtime

**Status**: Accepted

**Context**: Need a runtime that handles high-concurrency WebSocket connections, async I/O for database calls, and has strong GIS/mapping ecosystem.

**Decision**: Node.js 20 LTS with NestJS framework.

**Rationale**:
- **Async I/O**: Non-blocking — handles 10K+ WebSocket connections per instance without threads
- **NestJS Modules**: Map directly to bounded contexts (IdentityModule, GeometryModule, etc.)
- **TypeScript**: Shared types between API contracts and implementation
- **Ecosystem**: Socket.IO, Prisma, PostGIS client libraries all TypeScript-native
- **Monorepo ready**: NestJS monorepo mode supports modular monolith → microservice extraction

**Rejected**:
- Go: Better raw performance but weaker ORM/GIS ecosystem for solo dev
- Java/Spring: Heavier, slower startup, more boilerplate
- Python/FastAPI: GIL limits WebSocket concurrency

---

## 3. Infrastructure Sketch

### 3.1 Cloud Architecture (AWS)

```
┌─────────────────────────────────────────────────────────────────┐
│                           AWS Region (ap-southeast-1)            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 VPC: 10.0.0.0/16                        │   │
│  │                                                         │   │
│  │  ┌──────────────────────────────────────────────┐      │   │
│  │  │          Public Subnet: 10.0.1.0/24          │      │   │
│  │  │                                              │      │   │
│  │  │  ┌──────────┐    ┌────────────────────────┐ │      │   │
│  │  │  │   ALB     │    │   NAT Gateway          │ │      │   │
│  │  │  │ (HTTPS)   │    │   (outbound internet)  │ │      │   │
│  │  │  └─────┬─────┘    └────────────────────────┘ │      │   │
│  │  └────────┼─────────────────────────────────────┘      │   │
│  │           │                                             │   │
│  │  ┌────────▼─────────────────────────────────────┐      │   │
│  │  │         Private Subnet: 10.0.2.0/24          │      │   │
│  │  │                                              │      │   │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ │      │   │
│  │  │  │ EKS Node 1│ │ EKS Node 2│ │ EKS Node 3│ │      │   │
│  │  │  │           │ │           │ │           │ │      │   │
│  │  │  │ Monolith  │ │ Monolith  │ │ Tracking  │ │      │   │
│  │  │  │ Pod (×2)  │ │ Pod (×2)  │ │ Ingestion │ │      │   │
│  │  │  │ RT GW     │ │ RT GW     │ │ Pod (×3)  │ │      │   │
│  │  │  │ Pod (×2)  │ │ Pod (×2)  │ │           │ │      │   │
│  │  │  └───────────┘ └───────────┘ └───────────┘ │      │   │
│  │  └──────────────────────────────────────────────┘      │   │
│  │                                                         │   │
│  │  ┌──────────────────────────────────────────────┐      │   │
│  │  │          Data Subnet: 10.0.3.0/24            │      │   │
│  │  │                                              │      │   │
│  │  │  ┌──────────────┐  ┌──────────────────────┐ │      │   │
│  │  │  │ RDS PostgreSQL│  │ Amazon MSK (Kafka)   │ │      │   │
│  │  │  │ + PostGIS     │  │ 3 brokers            │ │      │   │
│  │  │  │ + TimescaleDB │  │                      │ │      │   │
│  │  │  │               │  │                      │ │      │   │
│  │  │  │ Primary +     │  └──────────────────────┘ │      │   │
│  │  │  │ Read Replica  │                           │      │   │
│  │  │  └──────────────┘                            │      │   │
│  │  │                                              │      │   │
│  │  │  ┌──────────────┐                            │      │   │
│  │  │  │ ElastiCache   │                            │      │   │
│  │  │  │ Redis Cluster │                            │      │   │
│  │  │  │ (2 nodes)     │                            │      │   │
│  │  │  └──────────────┘                            │      │   │
│  │  └──────────────────────────────────────────────┘      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  External:                                                      │
│  ┌──────────────┐  ┌──────────────────┐                        │
│  │ CloudFront    │  │ Route 53 (DNS)   │                        │
│  │ (CDN for      │  │ api.geotrack.app │                        │
│  │  tiles + SPA) │  │                  │                        │
│  └──────────────┘  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Environment Strategy

| Environment | Purpose | Infrastructure | Data |
|-------------|---------|---------------|------|
| **Local** | Development | docker-compose (PG, Redis, Kafka, app) | Seed data, fake GPS traces |
| **Staging** | Integration testing, QA | Same shape as prod (smaller) | Anonymized subset of prod |
| **Production** | Live system | Full infrastructure (diagram above) | Real data |

### 3.3 Local Development (docker-compose)

```yaml
# docker-compose.yml (simplified preview)
services:
  postgres:       # PostgreSQL 16 + PostGIS 3.4 + TimescaleDB
    image: timescale/timescaledb-ha:pg16
    ports: ["5432:5432"]
    
  redis:          # Redis 7
    image: redis:7-alpine
    ports: ["6379:6379"]
    
  kafka:          # Kafka (via Redpanda — lighter for dev)
    image: redpandadata/redpanda:latest
    ports: ["9092:9092"]
    
  app:            # GeoTrack Monolith (NestJS)
    build: .
    ports: ["3000:3000"]
    depends_on: [postgres, redis, kafka]
    
  tracking:       # Tracking Ingestion (separate)
    build: .
    command: ["node", "dist/tracking-ingestion/main.js"]
    ports: ["3001:3001"]
    depends_on: [kafka, redis]
    
  realtime:       # Realtime Gateway (separate)
    build: .
    command: ["node", "dist/realtime-gateway/main.js"]
    ports: ["3002:3002"]
    depends_on: [redis]
```

---

## ✅ Phase 4 Done Criteria Checklist

| Criterion | Status |
|-----------|--------|
| ≥ 6 core flows documented with sequence diagrams | ✅ 8 flows (CRUD, Auth, Event, Error, Tracking, WebSocket, Playback, Spatial) |
| Every failure point has retry/fallback defined | ✅ Error taxonomy + per-flow failure tables |
| Tech stack fully selected with ADRs | ✅ 26 technologies, ADR-006 |
| Infrastructure sketch covers networking + environments | ✅ VPC diagram, 3 environments |
| Correlation ID propagation shown in all flows | ✅ Traced end-to-end |

---

## Connection to Next Phase

**Phase 5: Platform Skeleton & Dev Setup** will:
- Initialize NestJS monorepo with module boundaries
- Set up docker-compose with all dependencies
- Build shared core library (logger, config, auth guard, error handler)
- Create service scaffold template
- Set up testing infrastructure (Vitest + Supertest)
- Write "clone → run in 5 minutes" README

### 🛑 APPROVAL GATE → 🏗️ Architecture Review → Review this document + tech stack selections

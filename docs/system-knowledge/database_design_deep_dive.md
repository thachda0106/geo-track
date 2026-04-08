# 2. DATABASE DESIGN (DEEP DIVE)

## 1. Deep Technical Explanation

### Internal Behavior of TimescaleDB Chunking
TimescaleDB operates by intercepting instructions to a parent "hypertable" and routing them to hidden child tables known as "chunks". The critical internal mechanic is that indexes in PostgreSQL are bound to individual tables. As a standard table scales to billions of rows, a standard B-Tree index becomes massive. If the working set of the index and table data exceeds available RAM, PostgreSQL relies heavily on OS page caching, leading to thrashing, page faults, and exponentially degrading write performance.

Timescale fixes this by maintaining bounded chunk sizes (typically driven by time, e.g., 1 day). Because chunks are inherently sized to fit into memory, the Write-Ahead Log (WAL) appending and index insertions happen entirely within L2/L3 CPU cache or RAM before flushing. Writes remain O(1) or flat O(log n), regardless of the hypertable's total volume.

### PostGIS GiST Mechanics & Why Not B-Tree
Standard B-Trees represent scalar linear orderings and fail mathematically in 2D or 3D spatial boundaries (an object cannot be "greater than" a coordinate; it intersects or is contained). 
PostGIS uses GiST (Generalized Search Tree) implementing an R-Tree logic. Bounding boxes are clustered geometrically. However, inserting into a giant GiST index is extremely CPU-heavy, as it must traverse the tree to find the minimal enclosing polygon that requires the least expansion.
By combining TimescaleDB with PostGIS, the GiST index is isolated *per chunk*. We localize the CPU-heavy R-Tree expansions to a single day's worth of data, preventing catastrophic insert degradation over months of operations.

### PgBouncer Transaction Pooling State Mechanics
Every connection in PostgreSQL spins up a heavyweight backend process, consuming roughly ~10MB of RAM. 10,000 connections equal ~100GB of RAM just for idle TCP states. 
PgBouncer intercepts these connections. In **Transaction Pooling Mode**, PgBouncer does not hold an active Postgres process for an idle client. When a Node.js worker issues a `BEGIN`, PgBouncer binds the TCP stream to a real backend PID. When it issues `COMMIT`, PgBouncer cuts the binding, returning the PID to the pool for another client.
This fundamentally breaks the PostgreSQL protocol for Prepared Statements. When a client issues `PREPARE S1`, it is mapped to Postgres PID "A". When the client issues `EXECUTE S1`, PgBouncer might route it to Postgres PID "B", which has no knowledge of `S1`. 

## 2. Production Architecture Details

### Data Flow at Runtime (Write Path)
1. **Node.js Memory Buffer**: The tracking worker aggregates a batch of 500-1000 location points within a specific time window or length threshold.
2. **PgBouncer Dispatch**: Node's connection pool checks out a connection and transmits the batched binary TCP payload to PgBouncer.
3. **Queue / Execution**: If the PgBouncer active pool is exhausted, it queues the request in memory. This is critical: PgBouncer acts as a shock absorber. It protects Postmaster from crashing under thunderous herds of connections.
4. **Postgres Buffer Flush**: Postgres writes the batch to the WAL immediately (fsync), marks the pages as "dirty" in its shared buffers, and returns success to Node.js.
5. **Background Writer**: A Postgres system process asynchronously flushes those dirty pages to the underlying NVMe/SSD.

### Scaling Model
To scale this layer, we distribute the database read and write profiles. 
We push all temporal aggregations into Timescale Continuous Aggregates (materialized views pushed into the background worker). 
For the volatile "Current State", we use standard PostgreSQL tables but mark them as `UNLOGGED` if temporary data loss is acceptable on crash, bypassing the WAL mechanism completely for massive TPS lifts.

## 3. Code Implementation (REAL, NOT PSEUDO)

### Optimal Bulk Insertion Bypassing ORM Bottlenecks
Prisma's `createMany` is notoriously slow for massive multi-column arrays because it generates monstrous parameterized strings (`VALUES ($1, $2, $3), ($4, $5, $6)...`) which exceed Postgres memory bounds for parameter parsing. 
The production standard is serializing to JSON and employing Postgres' built-in fast C-level JSON parser (`jsonb_to_recordset`).

```typescript
// tracking/infrastructure/tracking.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class TrackingRepository {
  constructor(private prisma: PrismaService) {}

  async bulkInsertLocations(batch: Array<{ 
    deviceId: string, 
    time: string, 
    lon: number, 
    lat: number, 
    speed: number 
  }>): Promise<void> {
    
    // Map object correctly for the recordset parser
    const payload = JSON.stringify(batch.map(b => ({
      d: b.deviceId,
      t: b.time,
      ln: b.lon,
      lt: b.lat,
      s: b.speed
    })));

    // Real world bulk insert. 
    // - Bypasses Prisma's extensive parameter AST building
    // - Converts JSON arrays internally at C-level in Postgres
    // - Casts SRID 4326 for geodetic (meters) accuracy
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO location_history (device_id, time, location, speed)
      SELECT 
        (elem->>'d')::uuid,
        (elem->>'t')::timestamptz,
        ST_SetSRID(ST_MakePoint((elem->>'ln')::float8, (elem->>'lt')::float8), 4326)::geography,
        (elem->>'s')::real
      FROM jsonb_to_recordset($1::jsonb) AS elem(d text, t text, ln float8, lt float8, s real);
    `, payload);
  }
}
```

### PgBouncer Production Configuration (pgbouncer.ini)
```ini
[databases]
# Mux connection string
geo_prod = host=127.0.0.1 port=5432 dbname=geo_prod pool_size=50

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
# Transaction pooling is strictly required
pool_mode = transaction
# Limit total max client connections tightly per server specs
max_client_conn = 10000
default_pool_size = 50
# Reserve pool kicks in for surges to prevent client timeouts
reserve_pool_size = 10
reserve_pool_timeout = 3
```

### Timescale Continuous Aggregate Definition
```sql
-- Creates an efficient background rollup table dropping granularity to 1 hour
CREATE MATERIALIZED VIEW location_history_hourly
WITH (timescaledb.continuous) AS
SELECT 
    device_id,
    time_bucket('1 hour', time) AS bucket,
    AVG(speed) as avg_speed,
    ST_MakeLine(location ORDER BY time) as travel_path
FROM location_history
GROUP BY device_id, time_bucket('1 hour', time);

-- Refresh policy: Update last 2 hours every 15 minutes
SELECT add_continuous_aggregate_policy('location_history_hourly',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes');
```

## 4. Performance & Scaling

### Bottlenecks and Throughput Limits
*   **WAL Disk I/O Saturation**: At higher volumes (>15k writes/sec), Postmaster spends all its IOPS syncing the WAL to disk, freezing buffer commits.
*   **Checkpoint Cascades**: PostGIS spatial calculations allocate intensive transient memory space. Deep buffer sweeps during forced checkpoints will freeze active queries locking index structures.
*   **Node V8 Garbage Collection**: Parsing tens of thousands of JSON events from Kafka per second allocates massive string arrays. The Node main thread will stutter, stalling the event loop and effectively preventing health check probes.

### Optimization Techniques
*   **`current_location` UNLOGGED table**: For high-churn real-time state where a 5-second delta loss during hard crash is acceptable. `ALTER TABLE current_location SET UNLOGGED;`. This skips the WAL entirely, speeding up `UPDATE` capacity by 400-500%.
*   **Shared Buffers and Work Mem**: Tune `shared_buffers` to 25%-40% of system RAM. Explicitly elevate `work_mem` for the worker context so PostGIS spatial sorts don't spill to disk.
*   **Timescale Compression**: Ensure historical chunks (older than 7 days) are explicitly compressed. PostGIS geometries compress beautifully using Timescale's dictionary encoding, reducing disk I/O significantly on analytical range queries.

## 5. Failure Scenarios

### Scenario A: Disk Fills due to WAL buildup (Storage Death)
**What happens**: Replica tracking falls behind or back-up stalls, causing PostgreSQL to retain WAL files until $PGDATA fills to 100%. Postgres panic-stops into read-only mode.
**Recovery Strategy**: 
1. Redpanda continues buffering IoT events (due to decoupling).
2. Manually increase EBS volume size or delete orphaned replication slots (`pg_drop_replication_slot`).
3. Restart Postgres. Consumers will batch-pull historical data and naturally catch up.

### Scenario B: Wrong Timescale Chunk Size leads to OOM
**What happens**: The `chunk_time_interval` is too large (e.g., 1 year). The active chunk hits 50GB. When executing heavy PostGIS bounding box searches, Postgres attempts to pull the chunk index into RAM, pushing out PgBouncer socket allocations. Linux OOM Killer murders the Postgres process.
**Recovery Strategy**: Migrate into a newly defined hypertable with dynamically compressed 1-day chunks. Size your chunks so that *all active chunks for all tables* fit comfortably in ~25% of your RAM.

### Scenario C: Kafka Deadlock from Poison Pill
**What happens**: A device firmware bug sends `{ "lat": "NaN", "lon": "UNDEFINED" }`. The raw `executeUnsafe` query throws an SQL Type exception. The worker `catch` fails to commit the offset to Kafka. The consumer restarts and retries the exact same batch, infinitely blocking that partition.
**Recovery Strategy**: Strict Zod boundary validation. For data that slips through, wrap the execute block in a try-catch, forward the failing payload to an SNS/Kafka Dead-Letter-Queue (DLQ), and artificially acknowledge the offset to advance the pointer.

## 6. Common Mistakes

1. **Relying on ORM Batching at Scale**: Allowing Prisma/TypeORM to `INSERT ... VALUES` 10,000 rows. This exhausts Postgres' 65,535 parameter limit and consumes 500MB of Node.js RAM to construct the AST. Use `jsonb_to_recordset` + raw queries for ingestion boundaries.
2. **Ignoring SRID Alignment**: Passing `ST_MakePoint(lon, lat)` defaults to SRID 0 (cartesian Euclidean grid). Calculating distances yields distances in "degrees", which varies radically depending on latitude. Always cast `ST_SetSRID(..., 4326)::geography` to compute actual spherical distances in meters.
3. **Prepared Statement Leaks in PgBouncer**: Failing to explicitly disable prepared statements in the ORM configuration (or Prisma `?pgbouncer=true`). This manifests as random `prepared statement S_X does not exist` errors as transactions swap PIDs.

## 7. Production Checklist
Before launching the DB layer to production:

- [ ] `pg_stat_statements` is enabled in `shared_preload_libraries` for isolating poorly planned queries.
- [ ] `wal_level` optimized; `max_wal_size` expanded to `4GB` or `8GB` to prevent thrashing checkpoints during traffic spikes.
- [ ] TimescaleDB active chunk sizes are mathematically verified to be < 25% of server Memory.
- [ ] Prisma connection strings universally use `?pgbouncer=true&connection_limit=2` in stateless functions / pods.
- [ ] Continuous Aggregate policies established for downsampling (e.g., keeping granular data for 30d, hourly data for 12m).
- [ ] Metrics exported via `postgres_exporter` and `pgbouncer_exporter` to Prometheus for tracking active backend utilization.
- [ ] Geometries have explicit spatial reference SRID bindings for `ST_DWithin` geofencing operations.

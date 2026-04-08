# Section 3: Data Flow & Streaming (Redpanda) - Extreme Depth

This is an extreme-depth expansion of the Data Flow & Streaming architecture for the geo-tracking platform.

---

## 1. Deep Technical Explanation

### Internal Behavior
For high-throughput geospatial ingestion, we utilize Redpanda (a C++ Kafka-API compatible broker) rather than JVM Kafka. Redpanda uses a thread-per-core (SeaStar) architecture and Direct I/O to bypass the Linux page cache, writing directly to NVMe SSDs. This guarantees deterministic single-digit millisecond tail latencies critical for acknowledging HTTP/gRPC ingress from thousands of concurrent devices.

At the core, a stream is an append-only log. When an edge gateway receives a location update, it calculates the partition using a consistent hash of the `device_id` (e.g., `MurmurHash2(device_id) % num_partitions`). This absolute determinism is non-negotiable for geo-tracking. If location updates cross partitions, consumers pull them out of chronological order, completely corrupting speed calculations, total distance traveled, and geofence triggering.

### Hidden Complexity
1.  **Partition Skew (The "Hot Fleet" Problem):** Hashing by `device_id` assumes traffic is evenly distributed. However, if a massive enterprise fleet comes online at 8:00 AM while other devices are inactive, a few partitions receive 90% of the traffic, choking specific consumer pods while others sit idle.
2.  **Offset Management vs. DB Transaction Alignment:** Offsets live in Redpanda (`__consumer_offsets`), but state lives in Postgres. If a consumer crashes *after* a DB commit but *before* the offset commit, the restarted consumer will replay the batch. 

### Why This Design Works 
By treating the stream as the unbreakable source of truth, we decouple volatile IoT network ingestion rates from disk-bound database I/O. The database can stall, vacuum, or undergo schema migrations, and the fleet continues to function perfectly—the edge layer gracefully buffers to Redpanda, and consumers simply resume backfilling when PostgreSQL is ready.

---

## 2. Production Architecture Details

### Data Flow at Runtime
1.  **Edge Ingress:** The `GatewayService` receives a raw JSON/Protobuf payload, verifies the JWT, and pushes it asynchronously to the `location.ingest` topic. It returns `202 Accepted` strictly *without* waiting for database persistence.
2.  **The Fetch-Accumulate-Trigger Loop:** The `TrackingWorker` runs a background thread via `kafkajs` (or `node-rdkafka` for higher perf). It fetches bytes in bulk, parsing them into an in-memory queue.
3.  **Micro-Batch Commit:** Once the memory queue hits `1,000` items OR an idle timer reaches `500ms`, the queue flushes via a bulk `INSERT` into TimescaleDB.
4.  **Offset Acknowledgment:** Only if the Postgres transaction commits successfully does the consumer push the highest contiguous offset to the Redpanda broker.

### Threading, Event Loop & Async Behavior
Node.js is single-threaded. High-volume JSON parsing of Kafka batches will block the V8 event loop, causing health-checks (liveness probes) to time out, killing the pod.
To solve this, we rely on `kafkajs` pulling bytes asynchronously on libuv worker threads. If the DB is slow, we use backpressure: the worker explicitly pauses Kafka fetching, protecting V8 heap memory from ballooning until the DB resolves the pending batch.

### Scaling Model
Scaling in Kafka/Redpanda is intrinsically bound by **Partition Count**. 
*   If `location.ingest` has 50 partitions, you can have a strict maximum of 50 Consumer Pods. Pod #51 will sit idle.
*   **Scale Trigger:** Never autoscale consumers on CPU. You must scale via Kubernetes HPA driven by **Consumer Lag** metrics (e.g., `kafka_consumergroup_lag` exported via Prometheus).

---

## 3. Code Implementation (REAL, NOT PSEUDO)

This implementation demonstrates a production-hardened NestJS worker module emphasizing micro-batching, proper backpressure, and DLQ handling.

### A. The Configuration (Infra Integration)
```typescript
// src/config/kafka.config.ts
import { KafkaOptions, Transport } from '@nestjs/microservices';
import { logLevel } from 'kafkajs';

export const getKafkaConfig = (): KafkaOptions => ({
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: `geo-tracker-${process.env.HOSTNAME}`,
      brokers: process.env.REDPANDA_BROKERS.split(','),
      logLevel: logLevel.ERROR, // Prevent log flood in production
      connectionTimeout: 3000,
      retry: {
        initialRetryTime: 100,
        retries: 8, // Exponential backoff for broker networking blips
      },
    },
    consumer: {
      groupId: 'tracking-persistence-group',
      sessionTimeout: 30000, // 30s to allow for heavy DB batch inserts without rebalancing
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 500, // Fetch tuning
      maxBytes: 5242880, // 5MB batches
    },
    run: {
      autoCommit: false, // CRITICAL: Manual commits only
      partitionsConsumedConcurrently: 3, // Multi-plex partitions on single thread
    },
  },
});
```

### B. The Batch Processing Service (Clean Architecture)
```typescript
// src/modules/tracking/infrastructure/kafka-consumer.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Consumer, Kafka, EachBatchPayload, Producer } from 'kafkajs';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class LocationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocationConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;

  constructor(private readonly prisma: PrismaService) {
    this.kafka = new Kafka({ ... /* Same as config above */ });
    this.consumer = this.kafka.consumer({ groupId: 'tracking-persistence-group' });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'location.ingest', fromBeginning: false });

    await this.consumer.run({
      autoCommit: false,
      eachBatch: async (payload: EachBatchPayload) => {
        await this.processBatch(payload);
      },
    });
  }

  private async processBatch({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary, uncommittedOffsets }: EachBatchPayload) {
    const rawEvents = batch.messages;
    const validRows = [];
    
    for (const msg of rawEvents) {
      try {
        const payload = JSON.parse(msg.value.toString());
        // Zod validation would occur here
        validRows.push({
          device_id: msg.key.toString(), // The partition key ensures sequence
          time: new Date(payload.timestamp),
          lon: payload.lon,
          lat: payload.lat,
          speed: payload.speed,
        });
      } catch (err) {
        this.logger.error(`Poison pill detected at offset ${msg.offset}`, err);
        await this.sendToDlq(batch.topic, msg);
        resolveOffset(msg.offset); // Acknowledge bad message so we don't stall
      }
    }

    if (validRows.length > 0) {
      try {
        // Heartbeat BEFORE heavy DB work to prevent rebalance
        await heartbeat(); 
        
        // Use raw execution for actual PostGIS geography performance
        const values = validRows.map(r => 
          `('${r.device_id}', '${r.time.toISOString()}', ST_SetSRID(ST_MakePoint(${r.lon}, ${r.lat}), 4326), ${r.speed})`
        ).join(',');

        await this.prisma.$executeRawUnsafe(`
          INSERT INTO location_history (device_id, time, location, speed)
          VALUES ${values}
          ON CONFLICT (device_id, time) DO NOTHING
        `);

        // Micro-batch successfully written. Now mark max offset as read.
        const highestOffset = batch.messages[batch.messages.length - 1].offset;
        resolveOffset(highestOffset);
        await commitOffsetsIfNecessary();

      } catch (dbError) {
        this.logger.error('Batch insert failed, Kafka will naturally retry this batch', dbError);
        // Do NOT resolve offsets. Force Kafka to replay.
        throw dbError; 
      }
    }
  }

  private async sendToDlq(originalTopic: string, msg: any) {
    await this.producer.send({
      topic: `${originalTopic}.dlq`,
      messages: [{ key: msg.key, value: msg.value, headers: { error: 'json_parse_or_schema_fail' } }],
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }
}
```

---

## 4. Performance & Scaling

### Bottlenecks
*   **The V8 Garbage Collector:** Processing 10,000 JSON messages per second per pod generates immense object churn. When V8 halts the world to GC, Kafka heartbeats miss their window, triggering a massive consumer group rebalance (The "Rebalance Storm" of death).
*   **Connection Pool Locking:** If Postgres uses row-locks due to misconfigured indexing, TimescaleDB chunks become highly contested, causing batch insertions to block for 5+ seconds.

### Throughput Limits
*   Single Node.js Pod (2 Cores, 2GB RAM): Concurrently processing micro-batches can typically max out around `5,000 - 8,000 TPS` before CPU maxes out parsing JSON.
*   Single PostgreSQL / TimescaleDB Target: Standard NVMe-backed RDS can sustain `50,000 - 100,000 TPS` using `COPY` or `INSERT ... VALUES` bulk logic, provided connection pooling is optimized.

### Optimization Techniques
*   **Move off JSON:** Switch to Protobuf or Apache Avro schema registries. The serialization/deserialization CPU cost drops by 70%, instantly doubling your pod throughput limit.
*   **Tuning `max.poll.interval.ms`:** This Kafka config must be *strictly greater* than your hypothetical worst-case database latency for a batch. If DB queries take 5s, `max.poll.interval` should be at least 15s.

---

## 5. Failure Scenarios

### 1. The Death Rebalance (Ghost Consumers)
*   **Scenario:** Load spikes. A pod grabs a massive batch of 20,000 messages. Processing takes 40 seconds. `sessionTimeout` is 30 seconds. Redpanda assumes the pod is dead and reassigns its partition to Pod B. Pod B grabs the same batch. Pod A finally finishes and fails to commit because its epoch is expired. Pod B now times out too. The topic completely halts processing.
*   **Recovery:** 
    1. Cap `maxBytes` on the consumer to physically prevent pulling too much data at once.
    2. Explicitly call `heartbeat()` inside the batch iteration loop if processing takes too long.

### 2. Time-Travel Payloads (Out of Order Updates)
*   **Scenario:** A delivery truck goes into a tunnel (offline). It reconnects and flushes 50 cached points from its local device buffer. Simultaneously, it sends its *current* live position. Due to cellular networking quirks, they arrive in different edge gateway ingest requests.
*   **Recovery:** Upserts to TimescaleDB must include `ON CONFLICT DO NOTHING` logic if updating "current location" aggregates. Standard TimescaleDB history hyper-tables will passively accept the historical inserts, but client dashboards must use spatial window functions to retrieve the absolute `MAX(time)` point, not just the "last row inserted."

---

## 6. Common Mistakes

What most engineers do wrong handling streaming geo-data at scale:

1.  **Using UUIDs as Partition Keys indiscriminately:** Using UUID v4 keys forces perfect round-robin distribution, obliterating chronological guarantees. All data for `Driver-123` goes to random nodes. Spatial pathing algorithms instantly break.
2.  **Relying on ORM Batching (`prisma.createMany`):** Most ORMs implement `createMany` by executing parameterized queries. A batch of 5,000 rows generates 10,000+ prepared parameters. Postgres will reject this (`bind message supplies 10000 parameters, but prepared statement requires 65535`). You must bypass the ORM and use raw String formatting for spatial bulk inserts.
3.  **Liveness Probing the Consumer:** Connecting Kubernetes liveness probes to the DB or Kafka connection state. A 5-second network blip to Redpanda makes the probe fail, causing Kubernetes to SIGTERM every worker pod simultaneously. Liveness should *only* check if the Node loop is unblocked.

---

## 7. Production Checklist

Before this stream infrastructure goes live, these must be verified:

- [ ] **Deterministic Partitioning Rules:** Validate that edge network layers don't mutate `device_id` casing or encoding before hashing for the partition key.
- [ ] **DLQ Alerting Active:** An unhandled error in the consumer must write to `.dlq` and an explicit PagerDuty/Slack alert must fire if DLQ volume > 0.
- [ ] **Consumer Offset Lag Alerts:** Set alerts to trigger if `kafka_consumer_lag` > `50,000`. This signifies the DB is falling permanently behind ingestion.
- [ ] **Over-Provisioned Partitions:** The `location.ingest` topic must be created with at least `60` partitions initially. You can scale pods up to 60, but you *cannot change the partition count of an actively streaming topic* without completely breaking the `device_id` hashing order.
- [ ] **Disable Auto-Commit:** Verified `autoCommit: false` in all worker modules. Offsets are only committed manually.

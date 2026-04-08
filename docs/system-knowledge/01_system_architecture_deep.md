# DEEP DIVE: SYSTEM ARCHITECTURE (Section 1 Expansion)

This document provides an extreme deep dive into the **System Architecture** of the Geo-Tracking Platform, expanding upon the bounded contexts, event-driven design, and the synchronization boundaries.

---

## 1. Deep Technical Explanation

### Internal Behavior of Bounded Contexts
A naive microservices architecture simply replaces in-process function calls with HTTP network calls, creating a distributed monolith. In a high-throughput geo-tracking platform, this guarantees cascading failures. 

To prevent this, the architecture is strictly split into isolated **Bounded Contexts** (DDD) that communicate *exclusively* via asynchronous events (Redpanda), except at the extreme edge:

1.  **Ingestion Context**: Ultra-thin edge gateway. Its sole purpose is to terminate TLS, validate the JWT, structurally validate the JSON payload using Zod (to prevent poisoning downstream consumers), and acknowledge (`202 Accepted`) by writing to Redpanda. It relies on the Node.js `libuv` event loop to handle massive concurrent passive connections.
2.  **Tracking Context**: Stateful consumer. Pulls from Redpanda, maintains local state (e.g., last known location per device to calculate jump/speed heuristics), and micro-batches inserts to TimescaleDB. 
3.  **Spatial Operations Context**: Pulls from Redpanda, loads polygon definitions from a read-replica or local cache, and performs `ST_Contains` style geofencing math. 

### Why the Sync/Async Boundary is Placed at the Broker
The boundary between Sync (HTTP Request $\rightarrow$ Response) and Async (Broker $\rightarrow$ DB) is the most critical architectural decision. If you attempt synchronous DB validation (e.g., checking if `device_id` exists in the DB on every ping), Postgres will hit connection and scaling limits instantly. By placing the boundary at the broker, Redpanda acts as a massive shock absorber. Spikes in location updates (e.g., 50,000 trucks turning on at 8:00 AM) are absorbed by Redpanda's sequentially written commit log, while downstream workers process them at their maximum bounded throughput.

### The WebSocket vs Polling Fallacy for Ingestion
For IoT ingestion, WebSockets (or raw TCP) require maintaining stateful connections. In Node.js, each WebSocket connection consumes memory and socket file descriptors. Tracking 1,000,000 devices via WebSockets requires 1,000,000 open file descriptors and a highly complex connection-draining strategy during deployments. 

Stateless HTTP/REST (or gRPC) forces the device to open a connection, send telemetry, and close (or keep-alive pool) the connection. The load balancer (e.g., NGINX/Envoy) can perfectly round-robin stateless HTTP traffic across edge nodes. WebSockets are strictly reserved for the **outbound** path—pushing map updates to a dispatcher's browser, where connection counts are much lower (1,000 dispatchers vs 1,000,000 trucks).

---

## 2. Production Architecture Details

### Data Flow at Runtime
1.  **Client/IoT**: Triggers `POST /v1/ingest/location` with a JSON payload and Bearer token.
2.  **Edge Gateway (Node.js/Fastify)**: The `epoll` reactor wakes up. Fastify parses the JSON. A Zod schema rejects invalid data in $<1ms$.
3.  **Kafka Producer**: `kafkajs` (or `librdkafka` bindings) buffers the event in memory. The HTTP request is closed immediately (`202 Accepted`).
4.  **Batch Flush**: In the background, the Kafka producer serializes the buffer and flushes a batch to the Redpanda leader broker over TCP.
5.  **Tracking Worker (Node.js)**: The Kafka consumer loop pulls a batch of 500 messages from Redpanda.
6.  **Processing**: The worker executes business logic (jump detection) and builds a bulk prepared statement.
7.  **Database Strategy**: The worker executes a single bulk `INSERT` to TimescaleDB, awaits the Promise, and *only then* commits the Kafka offsets.

### Threading and Event Loop Mechanics
Node.js is single-threaded. CPU-heavy tasks block the event loop, causing HTTP timeouts.
*   **Ingestion**: Almost entirely I/O bound. The event loop delegates network I/O to the kernel (epoll) and perfectly serves tens of thousands of concurrent requests.
*   **Tracking**: Building large SQL strings and parsing complex JSON arrays is CPU bound. If a worker processes 5,000 messages per batch, the event loop might stall for 50ms, missing health check pings and causing Kubernetes to restart the pod. **Scaling Model**: Workers must keep batch sizes tuned (e.g., 500) and scale horizontally across multiple pods mapped to Redpanda partitions.

---

## 3. Code Implementation (REAL)

This is a production-grade NestJS Ingestion Module using Fastify (for speed) and DDD concepts.

### Ingestion Module (`src/modules/ingestion/ingest.module.ts`)
```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { IngestController } from './interface/ingest.controller';
import { IngestService } from './application/ingest.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'REDPANDA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'ingest-gateway',
            brokers: [process.env.REDPANDA_BROKERS || 'redpanda:9092'],
            // Internal producer buffer tuning for high throughput
            retry: { initialRetryTime: 300, retries: 10 },
          },
          producer: {
            allowAutoTopicCreation: false,
            // Linger up to 5ms to build larger batches, drastically reducing network overhead
            linger: 5,
            // Required for Exactly-Once / Idempotency downstream
            idempotent: true, 
          },
        },
      },
    ]),
  ],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
```

### Zod Schema Validation (`src/modules/ingestion/interface/ingest.dto.ts`)
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// Strict validation is mandatory at the edge.
export const LocationSchema = z.object({
  deviceId: z.string().uuid(),
  timestamp: z.string().datetime(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  speed: z.number().min(0).max(1000).optional(),
});

export class LocationDto extends createZodDto(LocationSchema) {}
```

### Ingestion Controller (`src/modules/ingestion/interface/ingest.controller.ts`)
```typescript
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { IngestService } from '../application/ingest.service';
import { LocationDto } from './ingest.dto';

@Controller('v1/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('location')
  @HttpCode(HttpStatus.ACCEPTED) // 202 is critical for async semantics
  async ingestLocation(@Body() payload: LocationDto): Promise<void> {
    // The request completes immediately. Errors throw 400 (Zod) or 500.
    await this.ingestService.publishToBroker(payload);
  }
}
```

### Application Service (`src/modules/ingestion/application/ingest.service.ts`)
```typescript
import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { LocationDto } from '../interface/ingest.dto';

@Injectable()
export class IngestService implements OnModuleDestroy {
  constructor(
    @Inject('REDPANDA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async publishToBroker(payload: LocationDto): Promise<void> {
    // emit() returns an Observable. We convert to Promise to ensure the payload
    // actually hits the local producer buffer before we Ack 202 to the client.
    return new Promise((resolve, reject) => {
      this.kafka.emit('location.events', {
        headers: {
          'x-correlation-id': require('crypto').randomUUID(),
        },
        key: payload.deviceId, // Guarantees partition ordering per device
        value: {
          ...payload,
          ingestedAt: new Date().toISOString(), // Audit trail
        },
      }).subscribe({
        next: () => resolve(),
        error: (err) => reject(err),
      });
    });
  }

  async onModuleDestroy() {
    await this.kafka.close(); // Drain buffers gracefully on SIGTERM
  }
}
```

---

## 4. Performance & Scaling

### Bottlenecks & Throughput Limits
1.  **V8 Garbage Collection**: Parsing 10,000 JSON payloads per second generates massive allocation velocity. If GC takes too long, the event loop stutters.
    *   *Optimization*: Use Fastify's internal JSON parser, which avoids `JSON.parse` bloat, and run node with `--max-old-space-size` tuned to your pod boundaries.
2.  **Kafka Producer I/O**: A naive producer sends a TCP packet for *every* request.
    *   *Optimization*: High `linger.ms` (e.g., 5ms-10ms). The edge gateway holds the payload in memory for 5ms, clumps 50 payloads into one Kafka TCP payload, and fires it. This reduces broker CPU and network interrupts by 50x.
3.  **Partition Bottleneck**: A Kafka topic with 3 partitions maxes out at 3 concurrent Tracking Worker pods.
    *   *Scaling Strategy*: To hit 100k events/sec, provision Redpanda with 120+ partitions. Deploy a Kubernetes HPA targeting Kafka Lag (using KEDA) to scale the Tracking Worker deployment from 3 pods up to 120 pods dynamically.

---

## 5. Failure Scenarios and Recovery

### Scenario 1: Redpanda Leadership Election Delay
*   *Trigger*: A Redpanda broker node crashes in the Kubernetes cluster.
*   *Internal Behavior*: The Kafka producer in the Ingestion Pod suddenly gets TCP timeouts attempting to reach the leader for partition 7. 
*   *Failure*: If `retries` is 0, the Ingestion Pod throws 500s. The IoT device loses the data unless it has a local retry buffer.
*   *Recovery Strategy*: The `kafkajs` client is configured with `retry: 10` and an exponential backoff. The Node.js buffer holds the message while Redpanda elects a new partition leader (usually $<2s$). The producer successfully reconnects, flushes the buffer, and the IoT client sees a slightly slower `202 Accepted` (e.g., 2000ms instead of 5ms).

### Scenario 2: Tracking Worker Crash Loop (Poison Pill)
*   *Trigger*: A malformed coordinate technically passes Zod (e.g., `-180.000` float precision error later down the pipeline) but crashes PostGIS.
*   *Internal Behavior*: The worker fetches the batch, tries to insert to TimescaleDB, gets a SQL error, crashes. Kubernetes restarts the pod. It fetches the *exact same batch* because offsets were not committed. Crash repeating indefinitely. Kafka lag skyrockets.
*   *Recovery Strategy*: 
    1. Worker block catches the Postgres exception.
    2. Modifies the processing to route *that specific message* to a `location.dlq` (Dead Letter Queue) topic.
    3. Commits the offset for the entire batch.
    4. Worker continues processing while Engineers inspect the DLQ.

---

## 6. Common Mistakes

1.  **"Validate against DB on Ingest"**: Adding a synchronous `SELECT 1 FROM devices WHERE id = x` checks on the ingest route. 
    *   *Why it fails*: At 10,000 TPS, this requires 10,000 Db connections or massive connection pooling overhead. The database melts. The correct approach is rejecting unauthorized devices at the Edge via JWT, or having the async worker drop the message silently if the device doesn't exist in the DB.
2.  **Missing Partition Keys**: Emitting events to Redpanda *without* a `key: deviceId`. 
    *   *Why it fails*: Messages are round-robined across all partitions. Worker 1 processes `Message(T+5)` before Worker 2 processes `Message(T)`. Speed calculation shows the truck driving backwards at 1,000 MPH.
3.  **Relying on Auto-Commit**: Using the default Kafka auto-commit settings.
    *   *Why it fails*: Redpanda commits the offset the moment the message is fetched. If the DB goes down and the worker pod crashes before the `INSERT`, data is permanently lost.

---

## 7. Production Checklist
- [ ] **Edge Framework:** Swapped Express.js for Fastify.js to double base JSON parsing throughput.
- [ ] **HTTP Keep-Alive:** Gateway infrastructure (NGINX/AWS ALB) utilizes HTTP Keep-Alive to prevent TLS handshake overhead on every ping.
- [ ] **Broker Tuning:** Kafkajs `linger` and `batchSize` are explicitly configured for throughput, not zero-latency.
- [ ] **Partition Scaling:** Topic `location.events` is pre-created with enough partitions to support your 3-year growth projection (e.g., 64 or 128 partitions).
- [ ] **Pod Lifecycle:** Implementing `onModuleDestroy()` handles SIGTERM cleanly, allowing the producer buffer to drain to Redpanda before Kubernetes forcefully kills the pod, ensuring 0 data loss on scaling events.
- [ ] **Dead Letter Queue:** Every database operation in the consumer is wrapped in a try/catch -> DLQ to prevent blocking the partition.

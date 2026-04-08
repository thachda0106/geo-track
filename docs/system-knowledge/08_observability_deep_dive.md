# Observability (Production) - Extreme Depth

## 1. Deep Technical Explanation

Logging and tracing in a distributed geo-tracking system handling 10,000+ payload ingestions per second is fundamentally different from a standard CRUD application. 

### Internal Behavior & Context Propagation
In an event-driven architecture, a single logical request spans multiple isolated processes: an edge gateway, a message broker (Redpanda), a worker node, and database clusters. To connect these dislocated events, we rely on **Context Propagation** using the W3C Trace Context standard (`traceparent` and `tracestate`). 

Inside Node.js/NestJS, the V8 engine's asynchronous event loop (Promises, callbacks, `process.nextTick`) easily loses tracking context. We utilize `AsyncLocalStorage` (ALS), part of Node's `async_hooks` core API, to maintain a continuous correlation ID across asynchronous execution boundaries without passing a `req` object through every single function signature. 

### Hidden Complexity of Telemetry Output
When you emit telemetry (logs, metrics, traces), you are performing I/O. If your telemetry I/O is synchronous or uses heavy CPU serialization (like `JSON.stringify`), it blocks the single-threaded Node.js event loop. `console.log()` is pseudo-synchronous in Node.js when writing to pipes/stdout and will absolutely wreck the throughput of an ingestion gateway.

### Why OpenTelemetry (OTEL) + Pino Works
We decouple telemetry generation from telemetry shipping. 
- **Pino** is used because it formats JSON logs internally using highly optimized, specialized serializers instead of standard `JSON.stringify()`, and importantly, it flushes these strings to `stdout` asynchronously (using worker threads via `pino.destination({ sync: false })`).
- **OpenTelemetry (OTEL)** automatically monkeys-patches underlying standard libraries (`http`, `pg`, `kafkajs`) to hook into lifecycle events, automatically injecting and extracting context headers into HTTP requests and Kafka message headers. This maps the entire journey of a GPS ping from gateway to TimescaleDB.

---

## 2. Production Architecture Details

### Data Flow at Runtime
1. **Edge Gateway**: Receives `POST /location`. The OTEL middleware generates a Trace ID. The logger uses ALS to bind this Trace ID to the current execution context.
2. **Kafka Producer**: The OTEL `kafkajs` instrumentation intercepts the Kafka `send()` method. It serializes the Trace ID and inserts it into the Redpanda/Kafka message **Headers** (metadata, separate from the payload).
3. **Kafka Consumer (Worker)**: Redpanda delivers the message. The worker's OTEL instrumentation reads the message headers, extracts the Trace ID, and initializes a new `AsyncLocalStorage` state bounded to this specific trace.
4. **Log Forwarding**: Pino writes NDJSON (Newline Delimited JSON) to `stdout`. The Kubernetes runtime (containerd/Docker) captures `stdout` to node disk. A `DaemonSet` log shipper (e.g., Vector or FluentBit) tails these files, enriches them with Kubernetes metadata (pod name, node), and flushes them in bulk to Elasticsearch or Loki.

### Threading & Async Behavior
Because we configure Pino with asynchronous logging, the stringification and buffer flushing happen in a separate V8 Worker Thread. The main thread continues processing incoming locations without waiting for the physical OS pipe write to complete.

### Telemetry Sinks & Scaling
- **Logs**: Handled out-of-process by Vector/FluentBit.
- **Traces**: Exported via OTLP (gRPC) directly to an OpenTelemetry Collector deployed as a Kubernetes DaemonSet or Sidecar. The local collector handles backpressure, batching, and intelligent sampling, shielding the microservice application from network spikes to the upstream trace backend (Jaeger/Datadog/Tempo).

---

## 3. Code Implementation (REAL, NOT PSEUDO)

### 3.1. OpenTelemetry Initialization (`tracing.ts`)
*This MUST be the absolute first file executed, loaded before NestJS or any other imports, otherwise monkey-patching fails.*

```typescript
// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { KafkaJsInstrumentation } from '@opentelemetry/instrumentation-kafkajs';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTLP_ENDPOINT || 'localhost:4317', // Points to local OTEL Collector
});

export const otelSdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || 'geo-tracking-worker',
  }),
  traceExporter,
  instrumentations: [
    new HttpInstrumentation(),
    new KafkaJsInstrumentation({
      // Automatically inject/extract span context from Kafka headers
      producerHook: (span, topic, message) => {
        span.setAttribute('messaging.system', 'kafka');
      },
      consumerHook: (span, topic, message) => {
        span.setAttribute('messaging.system', 'kafka');
      }
    }),
    new PgInstrumentation(),
  ],
});

otelSdk.start();
```

### 3.2. Extreme-Performance Logger Setup (`logger.module.ts`)
*Utilizing `nestjs-pino` bound to `AsyncLocalStorage` and OTEL traces.*

```typescript
import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import trace from '@opentelemetry/api';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // Tie Pino logs to the current OpenTelemetry Trace ID seamlessly
        customProps: (req, res) => {
          const span = trace.trace.getSpan(trace.context.active());
          if (span) {
            const { traceId, spanId } = span.spanContext();
            return { traceId, spanId };
          }
          return {};
        },
        transport: process.env.NODE_ENV !== 'production' 
          ? { target: 'pino-pretty' } // Only pretty print locally
          : undefined, 
        // Asynchronous logging to prevent Event Loop block in PROD
        stream: process.env.NODE_ENV === 'production' 
          ? require('pino').destination({ sync: false, minLength: 4096 })
          : undefined, 
      },
    }),
  ],
})
export class AppLoggerModule {}
```

### 3.3. Custom Metrics for Domain Specifics
*You must track things outside standard CPU/RAM, like processing lag.*

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Meter, metrics } from '@opentelemetry/api';

@Injectable()
export class TelemetryService implements OnModuleInit {
  private meter: Meter;
  private batchSizeHistogram;

  onModuleInit() {
    this.meter = metrics.getMeter('geo-tracking-meter');
    
    // Custom domain metric: Track how large our PostGIS batches are
    this.batchSizeHistogram = this.meter.createHistogram('postgis_insert_batch_size', {
      description: 'Number of rows inserted per TimescaleDB transaction',
      unit: 'rows',
    });
  }

  recordBatchInsert(size: number) {
    this.batchSizeHistogram.record(size);
  }
}
```

---

## 4. Performance & Scaling

### Throughput Limits & Context Cost
- **ALS Overhead**: `AsyncLocalStorage` has improved significantly in Node 16+, but still introduces a ~2-5% CPU overhead on Promise resolution. This is acceptable for the observability gains.
- **Header Bloat**: Kafka headers add bytes. W3C trace contexts are small (~100 bytes), but if you inject large payload replicas into headers, it will degrade Redpanda disk writes and network bandwidth.

### The Tracing Sampling Problem (Bottleneck)
Generating un-sampled OTEL traces for 10,000 GPS pings per second will generate terabytes of trace data daily, crushing your network mesh and costing thousands of dollars in SAAS fees (e.g., Datadog, New Relic).
- **Optimization Strategy**: Implement **Tail-based Sampling** at the OTEL Collector layer.
- **How it works**: The Collector holds trace spans in memory for ~30 seconds. If an error occurs in the trace, or latency exceeds a threshold (e.g., >500ms), it samples (keeps) 100% of the trace. If it succeeds normally, it drops 99% of them. This gives you exact data exactly when you need it without paying for useless successful pings.

---

## 5. Failure Scenarios

### OTLP Collector Backpressure
- **Scenario**: Your upstream APM (Datadog/Tempo) rate-limits you, or network fails. The microservice's in-memory gRPC exporter queue fills up.
- **Recovery**: The OTEL SDK uses bounded queues. Once full, it starts silently dropping spans locally. This is *by design*. We sacrifice telemetry to protect the core business function. Application performance will not degrade; it just goes temporarily blind.

### `sync: false` Log Death Loss
- **Scenario**: Pino is buffering logs in memory (`sync: false`) waiting to hit 4KB before flushing to the OS. The Kubernetes node suffers a hard kernel panic or external OOM Kill (`SIGKILL`).
- **Recovery**: Logs currently in the 4KB memory buffer are instantly atomized and lost. In high-throughput architectures, this is an accepted tradeoff. You trade 4KB of potential log loss during catastrophic hardware failure for a 400% increase in baseline throughput. We protect critical data via Redpanda sync-commits and PostGIS WAL, not stdout logs.

---

## 6. Common Mistakes

1. **"We will build our own Correlation ID middleware"**:
   - Engineers often try to manually generate a UUID and pass it through services. They inevitably forget to pass it into Kafka libraries or HTTP clients, resulting in orphaned logs. W3C Trace Context and OTEL instrumentations handle this immaculately and automatically.
2. **Logging the Full GPS Payload**:
   - Naive implementation: `logger.info({ payload }, 'Received location')`.
   - Consequence: If the payload contains PII, you just contaminated your aggregated log store (which is usually accessible to all developers). Second, stringifying JSON objects tens of thousands of times a second destroys V8 garbage collection. Log the `device_id` and action, put the data in TimescaleDB.
3. **Using Redpanda/Kafka Consumer Groups as Log Parsers**:
   - Do not pull messages from Redpanda just to log "saw message" and drop it. Stream to Kafka directly, use Kafka metrics for throughput, and rely on infrastructure (like Kowl or Redpanda Console) to inspect messages in flight.

---

## 7. Production Checklist

- [ ] Pino is configured to use asynchronous streams (`sync: false`) in production to free the Node.js event loop.
- [ ] `AsyncLocalStorage` is active and binding the W3C `traceparent` ID seamlessly to every `pino` transport.
- [ ] Both standard HTTP paths *and* Kafka consumers/producers are explicitly patched by OpenTelemetry (`@opentelemetry/instrumentation-kafkajs`).
- [ ] An OpenTelemetry Collector (DaemonSet/Sidecar) is deployed to decouple the Node application from external SAAS telemetry latencies.
- [ ] Tail-based sampling is configured in the OTEL collector to preserve 100% of errors but drop 95%+ of routine ingestion successes.
- [ ] Node.js process gracefully flushes Pino on `SIGTERM` before exit via `pino.flush()`.
- [ ] No `console.log()` usage remains in the codebase (strictly forbidden via ESLint plugins).
- [ ] Sensitive payload attributes are aggressively redacted by Pino's `redact` configuration before being written to `stdout`.

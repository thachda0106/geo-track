# GeoTrack Observability — Tài Liệu Kỹ Thuật Chuyên Sâu

> Phiên bản: 2.0 — Production-Grade Observability Stack  
> Cập nhật: 2026-04-13  
> Công nghệ: nestjs-pino · prom-client · @sentry/nestjs · Prometheus · Grafana · Loki

---

## Mục Lục

1. [Kiến Trúc Tổng Quan](#1-kiến-trúc-tổng-quan)
2. [Vòng Đời Request — Từng Bước Qua Code](#2-vòng-đời-request--từng-bước-qua-code)
3. [Pillar 1: Structured Logging (Pino + AsyncLocalStorage)](#3-pillar-1-structured-logging)
4. [Pillar 2: RED Metrics (Prometheus + prom-client)](#4-pillar-2-red-metrics)
5. [Pillar 3: Distributed Tracing (Sentry + Prisma OTel)](#5-pillar-3-distributed-tracing)
6. [Trace Propagation Qua Outbox Pattern](#6-trace-propagation-qua-outbox-pattern)
7. [Error Handling & Observability](#7-error-handling--observability)
8. [Hạ Tầng Docker — Prometheus & Grafana](#8-hạ-tầng-docker--prometheus--grafana)
9. [Grafana Dashboard — Cách Query](#9-grafana-dashboard--cách-query)
10. [File Map — Mỗi File Làm Gì](#10-file-map--mỗi-file-làm-gì)
11. [Developer Guidelines](#11-developer-guidelines)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Kiến Trúc Tổng Quan

```
                    ┌─────────────────────────────────────────────────┐
                    │              GeoTrack NestJS App                │
                    │                                                 │
  HTTP Request ────►│  Middleware ──► Guards ──► Interceptors ──► Controller ──► Service  │
                    │      │              │           │                   │          │     │
                    │      ▼              │           ▼                   │          ▼     │
                    │  Pino-HTTP          │   HttpMetrics              │   Prisma       │
                    │  (auto-log          │   Interceptor              │   Instrumentation │
                    │   + correlationId)  │   (RED metrics)            │   (query spans)   │
                    │                     │                             │                   │
                    └──────┬──────────────┼─────────┬─────────────────┼────────┬──────────┘
                           │              │         │                 │        │
                    ┌──────▼──────┐  ┌────▼────┐  ┌─▼───────────┐  ┌─▼────────▼────┐
                    │  stdout/    │  │  JWT +   │  │  Prometheus │  │    Sentry     │
                    │  stderr     │  │  RBAC    │  │  /internal/ │  │  (traces +    │
                    │  (JSON)     │  │  Guards  │  │  metrics    │  │   profiling)  │
                    └──────┬──────┘  └─────────┘  └──────┬──────┘  └──────────────┘
                           │                              │
                    ┌──────▼──────┐              ┌────────▼────────┐
                    │    Loki     │              │   Prometheus    │
                    │  (log store)│              │  (metrics TSDB) │
                    └──────┬──────┘              └────────┬────────┘
                           │                              │
                           └──────────────┬───────────────┘
                                   ┌──────▼──────┐
                                   │   Grafana   │
                                   │  Dashboards │
                                   │ :3001       │
                                   └─────────────┘
```

### Technology Stack

| Layer | Công nghệ | Vai trò |
|-------|----------|---------|
| **Log Engine** | `pino` + `pino-http` via `nestjs-pino` | Structured JSON logging, auto request/response logging |
| **Correlation** | `AsyncLocalStorage` (Node.js built-in) | Tự động inject `correlationId` vào mọi dòng log |
| **Metrics Collection** | `prom-client` via `@willsoto/nestjs-prometheus` | Counter, Histogram, Gauge cho Prometheus |
| **Metrics Storage** | Prometheus `v2.51.0` | Scrape metrics mỗi 15s, lưu time-series data |
| **Tracing** | `@sentry/nestjs` + `@prisma/instrumentation` | Distributed traces bao gồm Prisma SQL spans |
| **Visualization** | Grafana `10.3.1` | Dashboards cho cả metrics (Prometheus) và logs (Loki) |
| **Log Aggregation** | Loki `2.9.4` | Log storage, hỗ trợ LogQL query |

---

## 2. Vòng Đời Request — Từng Bước Qua Code

Khi một HTTP request `POST /api/v1/tracking/ingest` đến server, đây là **chính xác** thứ tự code chạy:

### Bước 1: CorrelationIdMiddleware (Express Middleware)

```
File: libs/core/src/middleware/correlation-id.middleware.ts
Đăng ký tại: src/app.module.ts → configure() → consumer.apply(CorrelationIdMiddleware).forRoutes('*')
```

```typescript
// Chạy ĐẦU TIÊN trước mọi thứ khác
use(req: Request, _res: Response, next: NextFunction): void {
    const correlationId = req.headers['x-request-id'] as string | undefined;
    if (correlationId) {
        req.correlationId = correlationId;    // Gắn vào req object
        _res.setHeader('X-Request-Id', correlationId);  // Echo về client
    }
    next();
}
```

**Chức năng:**
- Đọc `X-Request-Id` từ header (đặt bởi API Gateway, Load Balancer, hoặc IoT Device)
- Gắn vào `req.correlationId` để các component khác (Error Filter, Outbox) sử dụng
- Trả ngược lại trên response header để client tracking
- **KHÔNG** tạo UUID — việc đó do pino-http xử lý (bước 2)

### Bước 2: pino-http Middleware (Tự động bởi nestjs-pino)

```
File: libs/core/src/logger/logger.module.ts
Đăng ký tự động bởi: PinoLoggerModule.forRootAsync() (nestjs-pino tự register middleware)
```

```typescript
pinoHttp: {
    level,  // Từ env LOG_LEVEL

    // TẠO correlationId — đây là nơi UUID được sinh ra
    genReqId: (req) => {
        return (req.headers['x-request-id'] as string) || crypto.randomUUID();
        //     ▲ Nếu client gửi ID    ▲ Nếu không → tự tạo UUID
    },

    // INJECT correlationId vào MỌI dòng log trong request scope
    customProps: (req: any) => ({
        correlationId: String(req.id ?? ''),
        //             ▲ req.id = giá trị từ genReqId ở trên
    }),
}
```

**Cơ chế AsyncLocalStorage (chi tiết):**
1. pino-http nhận request → gọi `genReqId(req)` → sinh UUID hoặc lấy từ header
2. Tạo một **child logger** của Pino root logger, bind `reqId` = UUID vào
3. Lưu child logger vào **`AsyncLocalStorage`** — một vùng nhớ gắn liền với async context hiện tại
4. Mọi lệnh `await` tiếp theo trong call chain đều nằm trong cùng async context
5. Khi bất kỳ service nào gọi `this.logger.info(...)`, `PinoLogger` tìm child logger trong `AsyncLocalStorage` → `correlationId` tự xuất hiện

```
AsyncLocalStorage hoạt động như một "invisible backpack":
─── Request A arrives (correlationId = "abc-123") ───────────────────────
│   CorrelationIdMiddleware.use()  │ backpack = {}
│   pino-http middleware           │ backpack = { childLogger: pino.child({reqId:"abc-123"}) }
│   JwtAuthGuard.canActivate()     │ backpack vẫn có childLogger
│   Controller.ingest()            │ logger.info() → tìm backpack → log có "abc-123"
│     └→ Service.process()         │ logger.info() → tìm backpack → log có "abc-123"
│       └→ PrismaService.create()  │ logger.info() → tìm backpack → log có "abc-123"
│ Response sent                    │ pino-http auto-log "request completed" có "abc-123"
────────────────────────────────────────────────────────────────────────
```

### Bước 3: HttpMetricsInterceptor (NestJS Interceptor)

```
File: libs/core/src/middleware/http-metrics.interceptor.ts
Đăng ký tại: src/app.module.ts → providers → { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }
```

```typescript
intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTime = Date.now();  // ← BẮT ĐẦU đo thời gian
    const route = req.route?.path || req.path;
    const method = req.method;

    return next.handle().pipe(
        tap({
            next: () => {
                const duration = (Date.now() - startTime) / 1000;
                // ▼ GHI 3 metrics cùng lúc
                this.requestCounter.inc({ method, route, status_code });     // Rate
                this.requestDuration.observe({ method, route, ... }, duration); // Duration
                if (statusCode >= 400) this.errorCounter.inc({ ... });       // Errors
            },
            error: (err) => {
                // Lỗi cũng được ghi metrics (không bị bỏ sót)
                this.requestCounter.inc(...)
                this.errorCounter.inc(...)
            }
        })
    );
}
```

**Tại sao dùng Interceptor thay vì Middleware?**
- Interceptor bọc (wrap) quanh **toàn bộ** handler execution
- `startTime` đo từ **trước** Guards+Pipes đến **sau** response serialize
- Middleware chỉ đo network I/O, không bao gồm business logic time

### Bước 4-6: Guards (JwtAuthGuard → RolesGuard → ThrottlerGuard)

```
Đăng ký tại: src/app.module.ts → providers → APP_GUARD
```

- `JwtAuthGuard`: Kiểm tra JWT token. Skip nếu route có `@Public()` decorator
- `RolesGuard`: Kiểm tra `@Roles('admin')` metadata
- `ThrottlerGuard`: Rate limiting (10 req/s, 100 req/min)

### Bước 7: Controller → Service (Business Logic)

Mọi service inject `AppLoggerService`. Khi gọi `this.logger.info(...)`:

```typescript
// libs/core/src/logger/logger.service.ts
@Injectable()
export class AppLoggerService implements LoggerService {
    constructor(
        @InjectPinoLogger(AppLoggerService.name)
        private readonly logger: PinoLogger,  // ← PinoLogger từ nestjs-pino
    ) {}

    info(message: string, meta?: Record<string, unknown>): void {
        this.logger.info(meta, message);
        // PinoLogger nội bộ:
        //   1. Tìm AsyncLocalStorage → lấy child logger có reqId
        //   2. Gọi childLogger.info(meta, message)
        //   3. Output JSON chứa correlationId TỰ ĐỘNG
    }

    // Gắn thêm context (userId, role) SAU khi auth xong
    assign(fields: Record<string, unknown>): void {
        this.logger.assign(fields);
        // Từ đây, MỌI log tiếp theo trong request này sẽ có userId, role
    }
}
```

### Bước 8: pino-http Auto-Log (Response)

Khi response gửi xong, pino-http tự động log:

```json
{
    "level": "info",
    "time": "2026-04-13T13:55:49.612Z",
    "req": { "method": "POST", "url": "/api/v1/tracking/ingest" },
    "correlationId": "DEMO-TRACE-777",
    "res": { "statusCode": 202 },
    "responseTime": 45,
    "msg": "request completed"
}
```

**Lưu ý:** Nếu status code ≥ 500 → log level tự chuyển sang `error`. 400-499 → `warn`. Cấu hình tại `customLogLevel` trong `logger.module.ts`.

### Bước 9: HttpErrorFilter (Nếu có lỗi)

```
File: libs/core/src/errors/http-error.filter.ts
Đăng ký tại: src/app.module.ts → providers → { provide: APP_FILTER, useClass: HttpErrorFilter }
```

Nếu bất kỳ bước nào ở trên throw exception:

```typescript
catch(exception: unknown, host: ArgumentsHost): void {
    // Lấy correlationId cho RESPONSE body (để client reference khi báo lỗi)
    const correlationId = request.correlationId
        || (request.headers['x-request-id'] as string)
        || 'unknown';

    // Log lỗi — correlationId TỰ ĐỘNG xuất hiện nhờ AsyncLocalStorage
    this.logger.warn(`HTTP exception: ${status} — ${message}`);
    // Output: {"level":"warn","correlationId":"abc-123","msg":"HTTP exception: 401 — Unauthorized"}

    // Trả RFC 7807 Problem Details cho client
    response.status(status).json({
        type: "https://api.geotrack.app/errors/http-401",
        title: "UNAUTHORIZED",
        status: 401,
        detail: "Unauthorized",
        instance: "/api/v1/tracking/ingest",
        correlationId: "abc-123"   // Client thấy ID này → gửi cho support → dò log ngay
    });
}
```

---

## 3. Pillar 1: Structured Logging

### 3.1 Cấu hình chi tiết (logger.module.ts)

```typescript
PinoLoggerModule.forRootAsync({
    useFactory: (config: ConfigService) => ({
        pinoHttp: {
            // ─── Level ───
            level: config.get('LOG_LEVEL') || 'info',
            //     trace < debug < info < warn < error < fatal

            // ─── Correlation ID ───
            genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
            customProps: (req) => ({ correlationId: String(req.id) }),

            // ─── Security: Redact sensitive data ───
            redact: {
                paths: [
                    'req.headers.authorization',  // JWT tokens
                    'req.headers.cookie',          // Session cookies
                    'req.body.password',            // User passwords
                    'req.body.token',               // Refresh tokens
                    'req.body.refreshToken',
                ],
                censor: '[REDACTED]',
            },

            // ─── Trim request/response noise ───
            serializers: {
                req: (req) => ({ method: req.method, url: req.url }),
                // Không log full headers (quá ồn, chứa token)
                res: (res) => ({ statusCode: res.statusCode }),
                // Không log response body (có thể chứa PII)
            },

            // ─── Smart log level per status code ───
            customLogLevel: (_req, res, err) => {
                if (err || res.statusCode >= 500) return 'error'; // 5xx = bug → alert
                if (res.statusCode >= 400) return 'warn';         // 4xx = client error
                return 'info';                                     // 2xx/3xx = success
            },

            // ─── Dev vs Prod format ───
            // Dev: colorized pretty print
            // Prod: raw JSON (cho Loki/ELK/CloudWatch parse)
        },
    }),
})
```

### 3.2 Log Levels và khi nào dùng

| Level | Giá trị | Khi nào dùng | Ví dụ | Alert? |
|-------|---------|-------------|-------|--------|
| `fatal` | 60 | Process sắp crash | `process.on('uncaughtException')` | 🔴 PagerDuty |
| `error` | 50 | Lỗi không mong đợi, cần fix | DB timeout, null pointer | 🔴 Slack alert |
| `warn` | 40 | Lỗi dự kiến, degraded nhưng sống | Rate limited, auth failed | 🟡 Monitor |
| `info` | 30 | Business milestones | User registered, Feature created | — Audit trail |
| `debug` | 20 | Logic flow (chỉ dev) | Cache hit, query params | — Dev only |
| `trace` | 10 | Extreme verbosity | Function entry/exit | — Never in prod |

### 3.3 Ví dụ Output thực tế

**Development (pino-pretty):**
```
[2026-04-13 20:55:49.612] INFO: request completed
    correlationId: "DEMO-TRACE-777"
    req: { method: "GET", url: "/health" }
    res: { statusCode: 200 }
    responseTime: 10
```

**Production (raw JSON — cho Loki ingestion):**
```json
{"level":"info","time":"2026-04-13T13:55:49.612Z","correlationId":"DEMO-TRACE-777","req":{"method":"GET","url":"/health"},"res":{"statusCode":200},"responseTime":10,"msg":"request completed"}
```

---

## 4. Pillar 2: RED Metrics

### 4.1 RED là gì?

RED là phương pháp monitoring chuẩn Google SRE dành cho service (microservice/API):

| Signal | Metric | Ý nghĩa | "Tôi muốn biết..." |
|--------|--------|---------|---------------------|
| **R**ate | `http_requests_total` | Bao nhiêu request/giây? | Tải của hệ thống |
| **E**rrors | `http_requests_errors_total` | Bao nhiêu % request lỗi? | Chất lượng service |
| **D**uration | `http_request_duration_seconds` | Request mất bao lâu? | Trải nghiệm user |

### 4.2 Khai báo Metrics (app.module.ts)

```typescript
providers: [
    // Counter: đếm tổng số request (chỉ tăng, không giảm)
    makeCounterProvider({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code'],
        // Labels cho phép filter: rate(http_requests_total{method="POST"}[5m])
    }),

    // Histogram: phân bố thời gian response
    makeHistogramProvider({
        name: 'http_request_duration_seconds',
        help: 'HTTP request duration in seconds',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        // Buckets xác định ngưỡng đo:
        //   0.01 = 10ms (rất nhanh)
        //   0.1  = 100ms (tốt)
        //   0.5  = 500ms (chấp nhận)
        //   1    = 1s (chậm)
        //   10   = 10s (timeout warning)
    }),

    // Counter: đếm riêng error responses
    makeCounterProvider({
        name: 'http_requests_errors_total',
        help: 'Total number of HTTP error responses (4xx + 5xx)',
        labelNames: ['method', 'route', 'status_code'],
    }),
]
```

### 4.3 Ghi Metrics (http-metrics.interceptor.ts)

```typescript
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
    constructor(
        @InjectMetric('http_requests_total') private readonly requestCounter: Counter<string>,
        @InjectMetric('http_request_duration_seconds') private readonly requestDuration: Histogram<string>,
        @InjectMetric('http_requests_errors_total') private readonly errorCounter: Counter<string>,
    ) {}

    intercept(context, next) {
        const startTime = Date.now();
        const route = req.route?.path || req.path;
        // ▲ Dùng route PATTERN (e.g., /api/v1/features/:id)
        // thay vì path thực (e.g., /api/v1/features/abc-123)
        // Lý do: tránh "label cardinality explosion" — hàng triệu unique labels
        //        sẽ kill Prometheus memory

        return next.handle().pipe(tap({
            next: () => {
                // ✅ Success path
                this.requestCounter.inc({ method, route, status_code });
                this.requestDuration.observe({ method, route, status_code }, duration);
                if (statusCode >= 400) this.errorCounter.inc({ ... });
            },
            error: (err) => {
                // ✅ Error path — VẪN ghi metrics (không bỏ sót)
                this.requestCounter.inc(...)
                this.errorCounter.inc(...)
            }
        }));
    }
}
```

### 4.4 Expose Metrics (metrics.controller.ts)

```typescript
@Controller('internal')
export class MetricsController {
    @Get('metrics')
    @Public()   // ← Bypass JWT Guard — Prometheus scraper không có token
    async getMetrics(@Res() res: Response): Promise<void> {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());  // Dump toàn bộ metrics từ prom-client registry
    }
}
```

**Tại sao `/internal/metrics` thay vì `/metrics`?**
- `@willsoto/nestjs-prometheus` tự đăng ký controller tại `/metrics` (built-in)
- Controller đó **không có** `@Public()` → bị `JwtAuthGuard` chặn
- Không thể override library controller → tạo endpoint riêng tại `/internal/metrics`

### 4.5 Ví dụ Output metrics thực tế

```
GET http://localhost:3000/internal/metrics
```

```prometheus
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health",status_code="200"} 25
http_requests_total{method="GET",route="/internal/metrics",status_code="200"} 3
http_requests_total{method="POST",route="/api/v1/tracking/ingest",status_code="202"} 150

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.01"} 20
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="0.05"} 25
http_request_duration_seconds_bucket{method="GET",route="/health",status_code="200",le="+Inf"} 25
http_request_duration_seconds_sum{method="GET",route="/health",status_code="200"} 0.125
http_request_duration_seconds_count{method="GET",route="/health",status_code="200"} 25

# HELP process_cpu_seconds_total Total user and system CPU time spent in seconds.
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 2.5

# HELP nodejs_eventloop_lag_seconds The event loop lag in seconds.
# TYPE nodejs_eventloop_lag_seconds gauge
nodejs_eventloop_lag_seconds 0.0102
```

---

## 5. Pillar 3: Distributed Tracing

### 5.1 Khởi tạo (main.ts) — THỨ TỰ QUAN TRỌNG

```typescript
// ┌──────────────────────────────────────────────────────────────────┐
// │ BƯỚC 1: Đăng ký PrismaInstrumentation → OpenTelemetry           │
// │ PHẢI chạy TRƯỚC Sentry.init() để Sentry nhận diện OTel spans   │
// └──────────────────────────────────────────────────────────────────┘
registerInstrumentations({
    instrumentations: [new PrismaInstrumentation()],
    // Từ đây, mỗi câu SQL qua Prisma sẽ tạo ra một OTel span:
    //   span.name = "prisma:client:operation"
    //   span.attributes = { "db.statement": "SELECT ... WHERE ST_Intersects(...)" }
});

// ┌──────────────────────────────────────────────────────────────────┐
// │ BƯỚC 2: Khởi tạo Sentry — nó sẽ tự phát hiện OTel ở trên      │
// └──────────────────────────────────────────────────────────────────┘
Sentry.init({
    dsn: sentryDsn,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 0.1,   // 10% requests → full trace (production safe)
    profilesSampleRate: 0.1,  // 10% traces → CPU profiling
    environment: 'development',
});

// ┌──────────────────────────────────────────────────────────────────┐
// │ BƯỚC 3: Hook Sentry error handler vào Express                   │
// │ Bắt mọi unhandled exception → gửi lên Sentry dashboard         │
// └──────────────────────────────────────────────────────────────────┘
Sentry.setupConnectErrorHandler(app);
```

**Nếu đảo thứ tự?**
- Nếu `Sentry.init()` chạy trước `registerInstrumentations()` → Prisma spans KHÔNG xuất hiện trên Sentry

### 5.2 Kết quả trên Sentry Dashboard

```
Transaction: POST /api/v1/tracking/ingest (45ms total)
├── http.middleware (CorrelationIdMiddleware)     2ms
├── http.guard (JwtAuthGuard)                    5ms
├── http.handler (TrackingIngestController)       38ms
│   ├── prisma:client:operation (findFirst)       8ms
│   │   └── db.statement: SELECT ... WHERE device_id = $1
│   ├── prisma:client:operation (create)          15ms
│   │   └── db.statement: INSERT INTO tracking.location_points (...)
│   └── prisma:client:operation (update)          10ms
│       └── db.statement: UPDATE tracking.sessions SET ...
└── http.response                                 0ms
```

---

## 6. Trace Propagation Qua Outbox Pattern

### Vấn đề

Trong kiến trúc event-driven, một request HTTP có thể trigger background job chạy **phút hoặc giờ sau**. Nếu background job crash, làm sao biết nó liên quan đến request gốc nào?

### Giải pháp: _correlationId Propagation

```
File: libs/core/src/outbox/outbox-relay.service.ts
```

```typescript
// OutboxRelayService quét bảng outbox mỗi giây
@Cron(CronExpression.EVERY_SECOND)
async relayEvents() {
    const events = await this.outboxService.fetchUnpublished(tx, 50, 'infrastructure');

    for (const event of events) {
        const correlationId = (safeEvent.correlation_id || safeEvent.correlationId) as string;

        // ▼ Forward correlationId trong event payload
        this.eventEmitter.emit(eventType, {
            ...event.payload,
            _eventId: event.id,
            _correlationId: correlationId,  // ← FROM ORIGINAL HTTP REQUEST
        });
    }
}
```

### Flow hoàn chỉnh

```
T+0s:  IoT Device → POST /tracking/ingest (X-Request-Id: "device-vn-999")
         │
         ├── pino-http: log {"correlationId":"device-vn-999","msg":"request completed"}
         ├── Service: INSERT INTO infrastructure.outbox (correlation_id = "device-vn-999")
         └── Response: 202 Accepted

T+1s:  OutboxRelayService (CronJob) quét outbox
         │
         ├── Đọc event, lấy correlation_id = "device-vn-999"
         └── eventEmitter.emit('tracking.location.created', { _correlationId: "device-vn-999" })

T+1s:  EventHandler nhận event
         │
         ├── logger.assign({ correlationId: event._correlationId })  // ← RE-BIND
         ├── Xử lý spatial processing...
         └── log {"correlationId":"device-vn-999","msg":"Geofence breach detected"}
```

**Kết quả:** Tìm kiếm trên Loki/Grafana: `{app="geotrack"} |= "device-vn-999"` → ra **TẤT CẢ** log từ HTTP request đến background processing.

---

## 7. Error Handling & Observability

### Error Classification Flow

```
Exception thrown anywhere in the call chain
         │
         ▼
    HttpErrorFilter.catch()
         │
         ├── instanceof DomainError? (Business error)
         │   │ Log: WARN level
         │   │ Response: 400/404/409 + Problem Details
         │   └ Example: "Feature not found", "Duplicate email"
         │
         ├── instanceof HttpException? (NestJS framework error)
         │   │ Log: WARN level
         │   │ Response: mapped status + Problem Details
         │   └ Example: "Unauthorized", "Validation failed"
         │
         └── Unknown Error? (BUG — needs attention)
             │ Log: ERROR level + full stack trace
             │ Response: 500 + sanitized message
             │ Sentry: auto-captured via setupConnectErrorHandler
             └ Example: null pointer, DB connection lost
```

### RFC 7807 Problem Details (Response format)

```json
{
    "type": "https://api.geotrack.app/errors/http-401",
    "title": "UNAUTHORIZED",
    "status": 401,
    "detail": "Invalid or expired JWT token",
    "instance": "/api/v1/tracking/ingest",
    "correlationId": "device-vn-999"
}
```

Client nhận `correlationId` → gửi cho support team → team search log bằng ID đó → debug trong 30 giây.

---

## 8. Hạ Tầng Docker — Prometheus & Grafana

### 8.1 Docker Compose Services

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-compose.yml                        │
├─────────────────┬───────┬───────────────────────────────────┤
│ Service         │ Port  │ Vai trò                           │
├─────────────────┼───────┼───────────────────────────────────┤
│ postgres        │ 5433  │ PostGIS + TimescaleDB             │
│ pgbouncer       │ 6432  │ Connection pooling                │
│ redis           │ 6380  │ Cache + session                   │
│ redpanda        │ 9092  │ Kafka-compatible event streaming  │
│ console         │ 8080  │ Redpanda admin UI                 │
│ loki            │ 3100  │ Log aggregation                   │
│ prometheus      │ 9090  │ Metrics scraping + storage        │
│ grafana         │ 3001  │ Dashboard visualization           │
└─────────────────┴───────┴───────────────────────────────────┘
```

### 8.2 Prometheus Scrape Config

```yaml
# scripts/prometheus/prometheus.yml
global:
  scrape_interval: 15s      # Mỗi 15 giây, Prometheus gọi GET /internal/metrics
  evaluation_interval: 15s   # Mỗi 15 giây, đánh giá alerting rules

scrape_configs:
  - job_name: 'geotrack-api'
    metrics_path: /internal/metrics  # ← Endpoint @Public() của chúng ta
    static_configs:
      - targets: ['host.docker.internal:3000']
        # ▲ host.docker.internal = bridge từ Docker container → host machine
        # NestJS chạy trên host machine ở port 3000
        labels:
          service: 'geotrack'
          environment: 'development'
```

### 8.3 Grafana Auto-Provisioned Datasources

```yaml
# scripts/grafana/datasources.yaml
apiVersion: 1
datasources:
  - name: Prometheus          # Metrics (PromQL)
    type: prometheus
    url: http://prometheus:9090  # Container-to-container networking
    isDefault: true

  - name: Loki                # Logs (LogQL)
    type: loki
    url: http://loki:3100
    isDefault: false
```

### 8.4 Network Flow

```
               host machine (:3000)                Docker network
                     │                                   │
    NestJS ──── /internal/metrics ◄────── Prometheus (:9090) ◄────── Grafana (:3001)
                     │                                   │                │
                     │                        http://prometheus:9090      │
                     │                                                    │
                     └──── stdout (JSON logs) ──────► Loki (:3100) ◄─────┘
                                                    http://loki:3100
```

---

## 9. Grafana Dashboard — Cách Query

### 9.1 PromQL Queries cho RED

| Panel | PromQL | Mô tả |
|-------|--------|-------|
| **Request Rate** | `rate(http_requests_total[5m])` | Requests/giây trong 5 phút gần nhất |
| **Error Rate %** | `rate(http_requests_errors_total[5m]) / rate(http_requests_total[5m]) * 100` | Phần trăm lỗi |
| **P99 Latency** | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` | 99% requests trả về trong X giây |
| **P50 Latency** | `histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))` | Median latency |
| **Per-Route Rate** | `sum by (route) (rate(http_requests_total[5m]))` | Rate phân tách theo route |
| **Slow Routes** | `histogram_quantile(0.99, sum by (route, le) (rate(http_request_duration_seconds_bucket[5m])))` | P99 theo từng route |
| **Node.js Memory** | `nodejs_heap_size_used_bytes / 1024 / 1024` | Heap memory (MB) |
| **Event Loop Lag** | `nodejs_eventloop_lag_seconds` | Event loop delay (giây) |
| **CPU Usage** | `rate(process_cpu_seconds_total[5m])` | CPU cores sử dụng |

### 9.2 LogQL Queries (Loki)

| Query | Mô tả |
|-------|-------|
| `{app="geotrack"} \|= "DEMO-TRACE-777"` | Tìm tất cả log theo correlationId |
| `{app="geotrack"} \| json \| level="error"` | Lọc error logs |
| `{app="geotrack"} \| json \| responseTime > 1000` | Request chậm (>1s) |

---

## 10. File Map — Mỗi File Làm Gì

```
libs/core/src/
├── logger/
│   ├── logger.module.ts          # Cấu hình nestjs-pino: genReqId, customProps, redact, serializers
│   └── logger.service.ts         # AppLoggerService wrapper: implement LoggerService, assign()
├── middleware/
│   ├── correlation-id.middleware.ts  # HTTP header contract: X-Request-Id → req.correlationId
│   └── http-metrics.interceptor.ts  # RED metrics: Counter + Histogram + Error Counter
├── health/
│   ├── health.module.ts          # Register HealthController + MetricsController
│   ├── health.controller.ts      # GET /health, GET /health/ready (@Public)
│   └── metrics.controller.ts     # GET /internal/metrics (@Public) — Prometheus scrape target
├── errors/
│   └── http-error.filter.ts      # Global exception → RFC 7807 Problem Details + auto-correlationId log
├── outbox/
│   └── outbox-relay.service.ts   # Forward _correlationId in event payload for async trace propagation

src/
├── main.ts                       # Bootstrap: nestjs-pino Logger, Sentry init, PrismaInstrumentation
└── app.module.ts                 # Wire everything: RED metric providers, global guards/interceptors/filters

scripts/
├── prometheus/prometheus.yml     # Prometheus scrape config: target host.docker.internal:3000
└── grafana/datasources.yaml      # Auto-provision Prometheus + Loki as Grafana datasources

docker-compose.yml                # Infrastructure: Postgres, Redis, Redpanda, Loki, Prometheus, Grafana
```

---

## 11. Developer Guidelines

### ✅ DO

```typescript
// 1. Inject AppLoggerService (KHÔNG dùng console.log)
constructor(private readonly logger: AppLoggerService) {}

// 2. Log objects, không concatenate strings
this.logger.info('Feature created', { featureId, userId, geometry: geomType });
// Output: {"correlationId":"abc","featureId":"123","userId":"456","msg":"Feature created"}

// 3. Assign context sau authentication
this.logger.assign({ userId: user.id, role: user.role });
// Từ đây TOÀN BỘ log trong request này tự có userId, role

// 4. Dùng đúng log level
this.logger.debug('Cache hit', { key });      // Dev only
this.logger.info('User registered', { email }); // Business event
this.logger.warn('Rate limit approaching', { current: 90, limit: 100 }); // Degraded
this.logger.error('Payment failed', trace, 'PaymentService');             // Need fix
```

### ❌ DON'T

```typescript
// 1. KHÔNG dùng console.log — nó bypass Pino, không có correlationId
console.log('something happened');  // ← NEVER

// 2. KHÔNG truyền correlationId tay — nó tự inject
this.logger.info('Created', { correlationId: req.correlationId }); // ← UNNECESSARY

// 3. KHÔNG log sensitive data
this.logger.info('Login', { password: user.password }); // ← SECURITY VIOLATION

// 4. KHÔNG log trong tight loops
for (const item of thousandItems) {
    this.logger.debug('Processing item', { id: item.id }); // ← PERFORMANCE KILL
}
// Thay vào: this.logger.info('Batch processed', { count: thousandItems.length });

// 5. KHÔNG dùng dynamic strings trong metric labels
this.counter.inc({ route: `/features/${featureId}` }); // ← CARDINALITY EXPLOSION
// Thay vào: dùng route pattern → /features/:id
```

---

## 12. Troubleshooting

### Q: correlationId không xuất hiện trong log?

**Nguyên nhân:** Đang dùng NestJS built-in `Logger` thay vì `PinoLogger`/`AppLoggerService`.

```typescript
// ❌ Sai — Logger từ @nestjs/common không có AsyncLocalStorage
import { Logger } from '@nestjs/common';
private readonly logger = new Logger(MyService.name);

// ✅ Đúng — AppLoggerService hoặc PinoLogger
constructor(private readonly logger: AppLoggerService) {}
```

### Q: /internal/metrics trả về 401?

**Kiểm tra:**
1. MetricsController có `@Public()` decorator không?
2. `'internal/metrics'` có trong `main.ts` → `setGlobalPrefix({ exclude: [...] })` không?
3. Route chính xác là `/internal/metrics` (không phải `/api/v1/internal/metrics`)

### Q: Prometheus không scrape được metrics?

**Kiểm tra:**
1. `docker logs geotrack-prometheus` — tìm lỗi scrape
2. Verify target: `http://localhost:9090/targets` → geotrack-api phải "UP"
3. `extra_hosts: ["host.docker.internal:host-gateway"]` có trong docker-compose không?
4. NestJS app có đang chạy trên port 3000 không?

### Q: Grafana panel trống / "No data"?

**Kiểm tra:**
1. Prometheus datasource: Grafana → Connections → Data Sources → Prometheus → Test → "Successfully queried"
2. Cần có traffic: chạy `curl http://localhost:3000/health` vài lần
3. Đợi ≥ 15s (scrape interval) sau khi có traffic
4. PromQL đúng không? Test trên Prometheus UI: `http://localhost:9090/graph`

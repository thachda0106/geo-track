# GeoTrack — Request Lifecycle Flow

## Complete Request Pipeline

```
HTTP Request arrives
    │
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│  1. EXPRESS MIDDLEWARE (main.ts)                                      │
│     ├── Helmet          → Security headers (XSS, HSTS, etc.)        │
│     └── CORS            → Origin validation                         │
├──────────────────────────────────────────────────────────────────────┤
│  2. NESTJS MIDDLEWARE (app.module.ts → configure())                   │
│     └── CorrelationIdMiddleware → Generate/extract X-Request-Id     │
├──────────────────────────────────────────────────────────────────────┤
│  3. GUARDS — "Can this request proceed?" (app.module.ts → APP_GUARD) │
│     ├── ThrottlerGuard  → Rate limiting (10 req/s, 100 req/min)     │
│     ├── JwtAuthGuard    → JWT validation (skip if @Public())        │
│     └── RolesGuard      → RBAC check (skip if no @Roles())         │
├──────────────────────────────────────────────────────────────────────┤
│  4. INTERCEPTORS — Pre-handler (APP_INTERCEPTOR)                     │
│     └── TimeoutInterceptor → Start 30s timer (or @Timeout(ms))      │
├──────────────────────────────────────────────────────────────────────┤
│  5. PIPES — "Validate & transform request body" (main.ts)            │
│     └── ValidationPipe  → class-validator + class-transformer       │
│         ├── whitelist: true        → strip unknown fields           │
│         ├── forbidNonWhitelisted   → reject unknown fields          │
│         └── transform: true        → auto-convert types             │
├──────────────────────────────────────────────────────────────────────┤
│  6. CONTROLLER → SERVICE → DATABASE                                  │
│     └── Business logic execution                                    │
├──────────────────────────────────────────────────────────────────────┤
│  7. INTERCEPTORS — Post-handler                                      │
│     └── TimeoutInterceptor → Cancel timer if completed in time      │
├──────────────────────────────────────────────────────────────────────┤
│  8. EXCEPTION FILTER (APP_FILTER) — Catches ANY thrown error         │
│     └── HttpErrorFilter → Convert to RFC 7807 Problem Details       │
└──────────────────────────────────────────────────────────────────────┘
    │
    ▼
HTTP Response returned
```

## Ví dụ cụ thể: `POST /api/v1/features` (Tạo GeoJSON feature)

### Happy Path ✅

```
Client: POST /api/v1/features
Headers:
  Authorization: Bearer eyJhbGciOiJI...
  Content-Type: application/json
  X-Request-Id: abc-123
Body:
  { "name": "HCM District 1", "geometry": {...}, "properties": {...} }

───────────────────────────────────────────────────────────

1. HELMET
   → Add security headers (X-Content-Type-Options, X-Frame-Options, etc.)
   → Pass ✅

2. CORS
   → Check Origin: https://geotrack.example.com
   → Allowed in CORS_ORIGINS? → Yes ✅

3. CORRELATION ID MIDDLEWARE
   → X-Request-Id header exists: "abc-123"
   → req.correlationId = "abc-123"
   → res.setHeader("X-Request-Id", "abc-123")
   → Pass ✅

4. THROTTLER GUARD
   → Check rate limit for this IP
   → 5 requests in last second (limit: 10) → Under limit ✅

5. JWT AUTH GUARD
   → @Public() on this route? → No
   → Extract Bearer token from Authorization header
   → Verify JWT signature with JWT_SECRET
   → Decode payload: { sub: "user-uuid", email: "thach@...", role: "editor" }
   → Attach to req.user → Pass ✅

6. ROLES GUARD
   → @Roles('editor', 'admin') on this route? → Yes
   → req.user.role = "editor" → In required roles? → Yes ✅

7. TIMEOUT INTERCEPTOR (pre)
   → @Timeout() on this route? → No → Use default 30s
   → Start 30s timer

8. VALIDATION PIPE
   → Transform body to CreateFeatureDto (class-transformer)
   → Validate with class-validator decorators
   → name: "HCM District 1" → @IsString() @MinLength(1) → Valid ✅
   → geometry: {...} → @IsObject() → Valid ✅
   → Strip unknown fields (whitelist: true)

9. CONTROLLER → SERVICE
   → FeatureController.create(dto, req.user)
   → FeatureService.create(dto, userId)
   → Prisma transaction:
       INSERT INTO features...
       OutboxService.publishEvent(tx, { eventType: "FeatureCreated", ... })
   → Return { id: "new-uuid", name: "HCM District 1", ... }

10. TIMEOUT INTERCEPTOR (post)
    → Response returned in 45ms → Cancel 30s timer ✅

11. RESPONSE
    → Status: 201 Created
    → Headers: X-Request-Id: abc-123
    → Body: { "id": "new-uuid", "name": "HCM District 1", ... }
```

### Error Paths ❌

#### Lỗi ở Guard: JWT invalid

```
3. JWT AUTH GUARD
   → Token expired / invalid signature
   → throw UnauthorizedException("Unauthorized")
   │
   └──→ Skip tất cả bước 4-9
        │
        ▼
8. HTTP ERROR FILTER catches UnauthorizedException
   → Response 401:
     {
       "type": "https://api.geotrack.app/errors/http-401",
       "title": "UNAUTHORIZED",
       "status": 401,
       "detail": "Unauthorized",
       "correlationId": "abc-123"
     }
```

#### Lỗi ở Guard: Rate limit

```
4. THROTTLER GUARD
   → 15 requests in last second (limit: 10)
   → throw ThrottlerException("Too Many Requests")
   │
   └──→ Skip tất cả bước 5-9
        │
        ▼
8. HTTP ERROR FILTER catches HttpException
   → Response 429:
     {
       "type": "https://api.geotrack.app/errors/http-429",
       "title": "TOO_MANY_REQUESTS",
       "status": 429,
       "detail": "Too Many Requests"
     }
```

#### Lỗi ở Pipe: Validation failed

```
8. VALIDATION PIPE
   → name: "" → @MinLength(1) → FAIL
   → geometry: null → @IsObject() → FAIL
   → throw BadRequestException with errors array
   │
   └──→ Skip bước 9 (controller)
        │
        ▼
8. HTTP ERROR FILTER catches HttpException
   → Response 400:
     {
       "type": "https://api.geotrack.app/errors/http-400",
       "title": "BAD_REQUEST",
       "status": 400,
       "detail": "Bad Request",
       "errors": [
         { "field": "unknown", "code": "VALIDATION", "message": "name should not be empty" },
         { "field": "unknown", "code": "VALIDATION", "message": "geometry must be an object" }
       ]
     }
```

#### Lỗi ở Service: Domain error

```
9. SERVICE
   → FeatureService.create()
   → Feature with same name exists
   → throw DuplicateError("Feature", "name", "HCM District 1")
   │
   ▼
8. HTTP ERROR FILTER catches DomainError
   → toProblemDetails(error) → RFC 7807:
     {
       "type": "https://api.geotrack.app/errors/duplicate",
       "title": "DUPLICATE",
       "status": 409,
       "detail": "Feature with name=\"HCM District 1\" already exists",
       "correlationId": "abc-123"
     }
```

#### Lỗi ở Interceptor: Timeout

```
7. TIMEOUT INTERCEPTOR
   → 30s timer expires (heavy DB query)
   → throw RequestTimeoutException("Request timed out after 30000ms")
   │
   ▼
8. HTTP ERROR FILTER catches HttpException
   → Response 408:
     {
       "type": "https://api.geotrack.app/errors/http-408",
       "title": "REQUEST_TIMEOUT",
       "status": 408,
       "detail": "Request timed out after 30000ms"
     }
```

#### Lỗi không mong đợi: Bug

```
9. SERVICE
   → TypeError: Cannot read property 'x' of undefined
   │
   ▼
8. HTTP ERROR FILTER catches unknown Error
   → Log FULL stack trace (for debugging)
   → Response 500 (SANITIZED — không leak stack trace):
     {
       "type": "https://api.geotrack.app/errors/internal",
       "title": "Internal Server Error",
       "status": 500,
       "detail": "An unexpected error occurred",     ← generic, không lộ chi tiết
       "correlationId": "abc-123"                     ← dùng ID này để tìm trong logs
     }
```

## Ví dụ: Public route (Health check)

```
GET /health

1. HELMET → Pass ✅
2. CORS → Pass ✅
3. CORRELATION ID → Generate UUID ✅
4. THROTTLER GUARD → Check rate limit → Pass ✅
5. JWT AUTH GUARD
   → @Public() on HealthController.check()? → YES
   → Skip JWT validation ✅
6. ROLES GUARD → No @Roles() → Skip ✅
7. TIMEOUT INTERCEPTOR → Start 30s timer
8. VALIDATION PIPE → No body → Skip
9. CONTROLLER
   → HealthController.check()
   → { status: "ok" }
10. Response 200: { "status": "ok" }
```

## Ví dụ: IoT Ingest (API Key auth)

```
POST /api/v1/tracking/ingest
Headers:
  X-API-Key: my-iot-device-key-32chars-minimum

1-3. Helmet, CORS, Correlation ID → Pass ✅
4. THROTTLER GUARD → Pass ✅
5. JWT AUTH GUARD
   → @Public() on IngestController? → YES → Skip JWT ✅
6. ROLES GUARD → No @Roles() → Skip ✅
   → But @UseApiKey() activates ApiKeyGuard:
     → Extract X-API-Key header
     → timingSafeEqual(apiKey, INGEST_API_KEY)
     → Match? → Pass ✅
7-9. Timeout, Validation, Controller → Normal flow
```

## Tổng kết thứ tự thực thi

```
REQUEST →  Middleware  →  Guards      →  Interceptor  →  Pipe    →  Controller
           (trước)       (auth/rate)     (trước)        (validate)   (business)
              │              │               │              │            │
              │              │               │              │            │
              │              │               │              │            ▼
RESPONSE ←            ←              ←  Interceptor  ←             ← Service
                                         (sau)
              │
              └── Exception Filter catches ANY error from ANY layer above
```

Nơi đăng ký từng layer:

| Layer | Registered in | How |
|-------|--------------|-----|
| Helmet, CORS | `main.ts` | `app.use(helmet())`, `app.enableCors()` |
| CorrelationIdMiddleware | `app.module.ts` | `configure(consumer)` |
| ThrottlerGuard | `app.module.ts` | `APP_GUARD` |
| JwtAuthGuard | `app.module.ts` | `APP_GUARD` |
| RolesGuard | `app.module.ts` | `APP_GUARD` |
| TimeoutInterceptor | `app.module.ts` | `APP_INTERCEPTOR` |
| ValidationPipe | `main.ts` | `app.useGlobalPipes()` |
| HttpErrorFilter | `app.module.ts` | `APP_FILTER` |

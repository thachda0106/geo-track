# Prisma Production Deep Dive — Principal Engineer's Guide

> **Mindset**: Prisma là một tool. Tool tốt khi dùng đúng chỗ, tool tệ khi dùng sai chỗ. Document này dạy bạn biết **khi nào dùng**, **khi nào né**, và **tại sao**.

---

## 1. Prisma Architecture Deep Dive

### 1.1 Prisma Client hoạt động như thế nào

Prisma **không phải** ORM truyền thống. Nó là **query builder + code generator** với một kiến trúc khá đặc biệt:

```
Your Code → Prisma Client (TypeScript) → Query Engine (Rust binary) → PostgreSQL
```

**Query Engine** là một binary Rust chạy như một sidecar process:
- Prisma Client gọi Query Engine qua **JSON-RPC** (hoặc N-API từ v5+)
- Query Engine parse request → build SQL → gửi tới database
- Connection pooling nằm trong Query Engine, **không phải** trong Node.js

```typescript
// Khi bạn viết:
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { orders: true }
});

// Prisma Client serialize thành JSON request:
// {
//   "action": "findUnique",
//   "modelName": "User",
//   "query": { "where": { "id": 1 }, "include": { "orders": true } }
// }

// Query Engine dịch thành SQL:
// SELECT "User"."id", "User"."name", "User"."email" FROM "User" WHERE "User"."id" = $1;
// SELECT "Order"."id", "Order"."userId", ... FROM "Order" WHERE "Order"."userId" IN ($1);
```

> [!WARNING]
> **Connection Pool nằm ở Query Engine**, không phải Node.js. Default pool size = `num_cpus * 2 + 1`. Trong container Docker với limit CPU, `num_cpus` có thể trả về số CPU của host → pool size quá lớn → exhausted connections.

```typescript
// Fix: Luôn set explicit connection limit trong production
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `${process.env.DATABASE_URL}?connection_limit=10&pool_timeout=30`
    }
  }
});
```

### 1.2 Prisma vs ORM truyền thống

| Aspect | Prisma | TypeORM | Sequelize |
|--------|--------|---------|-----------|
| Query Building | Code-gen từ schema | Runtime reflection | Runtime reflection |
| Type Safety | **Full** (generated types) | Partial (decorators) | Weak |
| SQL Generation | Predictable, readable | Unpredictable joins | Unpredictable |
| Raw SQL | `$queryRaw` | `query()` | `sequelize.query()` |
| Migration | Schema-first, declarative | Code-first hoặc manual | Code-first |
| N+1 | Batched queries (không dùng JOIN) | Lazy loading trap | Lazy loading trap |
| Connection Pool | Rust engine managed | Node.js managed | Node.js managed |
| Learning Curve | Low entry, high ceiling | Medium | Medium |

**Trade-off quan trọng nhất**: Prisma dùng **separate queries thay vì JOIN**. Điều này:
- ✅ **Tốt** cho read đơn giản, tránh Cartesian explosion
- ❌ **Xấu** cho complex aggregation, reporting queries
- ❌ **Xấu** khi cần JOIN 5+ bảng với điều kiện phức tạp

```typescript
// Prisma generates 2 queries (KHÔNG phải JOIN):
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { orders: { include: { items: true } } }
});
// Query 1: SELECT * FROM "User" WHERE id = 1
// Query 2: SELECT * FROM "Order" WHERE "userId" IN (1)
// Query 3: SELECT * FROM "OrderItem" WHERE "orderId" IN (...)

// TypeORM mặc định JOIN:
// SELECT u.*, o.*, i.* FROM user u
// LEFT JOIN order o ON u.id = o.userId
// LEFT JOIN order_item i ON o.id = i.orderId
// WHERE u.id = 1
// → Cartesian explosion nếu 1 user có 100 orders, mỗi order 10 items = 1000 rows
```

### 1.3 Khi nào KHÔNG nên dùng Prisma

> [!CAUTION]
> Đừng ép Prisma vào mọi use case. Đây là các trường hợp nên dùng alternative:

1. **Heavy analytics/reporting**: Cần complex aggregations, window functions, CTEs lồng nhau → Dùng raw SQL hoặc dedicated query builder (Knex.js)
2. **Bulk operations lớn (100k+ rows)**: Prisma `createMany` có limit, không hỗ trợ `COPY` → Dùng `pg-copy-streams`
3. **Real-time streaming**: Prisma không có native streaming support → Dùng `pg` driver trực tiếp với cursors
4. **Multi-database transactions**: Prisma không hỗ trợ distributed transactions
5. **Database-specific features**: Prisma abstract away DB-specific features (TimescaleDB continuous aggregates, PG logical replication) → Phải dùng raw SQL

---

## 2. Schema Design (Production Level)

### 2.1 Multi-Schema Architecture

```prisma
// schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["identity", "core", "tracking", "versioning"]
}

// Tách theo domain boundary
model User {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email     String   @unique
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  // Relations
  sessions  Session[]
  orders    Order[]

  @@map("users")
  @@schema("identity")
}

model Order {
  id        String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String      @map("user_id") @db.Uuid
  status    OrderStatus @default(PENDING)
  total     Decimal     @db.Decimal(12, 2)
  metadata  Json?       @db.JsonB
  createdAt DateTime    @default(now()) @map("created_at")
  
  user      User        @relation(fields: [userId], references: [id])
  items     OrderItem[]

  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
  @@map("orders")
  @@schema("core")
}
```

> [!IMPORTANT]
> **Naming Convention Production**:
> - Model name: PascalCase (`User`, `OrderItem`)
> - Database table: snake_case via `@@map("order_items")`
> - Database column: snake_case via `@map("user_id")`
> - Enum values: SCREAMING_SNAKE_CASE
> - Luôn dùng `@map` và `@@map` — đừng để Prisma tự đặt tên DB

### 2.2 Relationship Pitfalls

#### One-to-One: Cần biết FK nằm ở đâu

```prisma
// ❌ SAI: FK ở cả 2 bên → circular dependency
model User {
  id      String  @id
  profile Profile @relation(fields: [profileId], references: [id])
  profileId String @unique
}
model Profile {
  id     String @id
  user   User   @relation(fields: [userId], references: [id])
  userId String @unique
}

// ✅ ĐÚNG: FK ở 1 bên, bên kia dùng back-relation
model User {
  id      String   @id
  profile Profile?
}
model Profile {
  id     String @id
  userId String @unique @map("user_id")
  user   User   @relation(fields: [userId], references: [id])
}
```

#### Many-to-Many: Explicit join table luôn tốt hơn implicit

```prisma
// ❌ Implicit (Prisma tự tạo join table _TagToPost)
// Không kiểm soát được tên bảng, không thêm metadata được
model Post {
  tags Tag[]
}
model Tag {
  posts Post[]
}

// ✅ Explicit join table — production-grade
model PostTag {
  postId    String   @map("post_id") @db.Uuid
  tagId     String   @map("tag_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")
  createdBy String?  @map("created_by") @db.Uuid
  
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)
  
  @@id([postId, tagId])
  @@index([tagId])
  @@map("post_tags")
  @@schema("core")
}
```

### 2.3 Indexing Strategy

```prisma
model Order {
  id        String      @id @db.Uuid
  userId    String      @map("user_id") @db.Uuid
  status    OrderStatus
  total     Decimal     @db.Decimal(12, 2)
  metadata  Json?       @db.JsonB
  createdAt DateTime    @default(now()) @map("created_at")
  deletedAt DateTime?   @map("deleted_at")
  
  // === INDEX STRATEGY ===
  
  // 1. Composite index cho query phổ biến nhất
  // "Lấy orders của user X, mới nhất trước"
  @@index([userId, createdAt(sort: Desc)])
  
  // 2. Partial index cho soft delete (Prisma hỗ trợ qua raw SQL migration)
  // Chỉ index records chưa bị xóa
  // → Phải viết migration thủ công: 
  // CREATE INDEX idx_orders_active ON orders(user_id, created_at) WHERE deleted_at IS NULL;
  
  // 3. GIN index cho JSONB (phải viết raw SQL)
  // CREATE INDEX idx_orders_metadata ON orders USING GIN(metadata);
  
  // 4. Prisma native index
  @@index([status]) // B-tree, tốt cho equality & range
  
  @@map("orders")
  @@schema("core")
}
```

> [!TIP]
> **Index Rule of Thumb**:
> - Composite index: columns **theo thứ tự selectivity** (equality trước, range sau)
> - Covering index nếu query chỉ cần data từ index
> - **Đừng** index mọi thứ — mỗi index = overhead khi write
> - Monitor `pg_stat_user_indexes` để tìm unused indexes

### 2.4 Soft Delete Pattern

```prisma
model BaseEntity {
  // Không có abstract model trong Prisma, nhưng pattern này apply cho mọi model
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")
}

model Order {
  id        String    @id @db.Uuid
  // ... fields
  deletedAt DateTime? @map("deleted_at")
  
  @@map("orders")
}
```

```typescript
// Middleware pattern cho soft delete — apply globally
prisma.$use(async (params, next) => {
  // Intercept delete → update deletedAt
  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
  }
  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    if (params.args.data !== undefined) {
      params.args.data.deletedAt = new Date();
    } else {
      params.args.data = { deletedAt: new Date() };
    }
  }
  
  // Intercept reads → filter deleted
  if (params.action === 'findFirst' || params.action === 'findMany') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    if (params.args.where.deletedAt === undefined) {
      params.args.where.deletedAt = null; // Only non-deleted
    }
  }
  
  return next(params);
});
```

> [!WARNING]
> **Soft delete pitfalls**:
> 1. `@unique` constraints vẫn apply cho deleted records → Cần partial unique index: `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`
> 2. Relation cascade delete không trigger middleware → Data orphan
> 3. Table size grows forever → Cần archival job
> 4. Prisma middleware đã deprecated → Dùng **client extensions** thay thế (Prisma 4.16+)

```typescript
// ✅ Modern approach: Client Extensions (thay middleware)
const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async findMany({ model, operation, args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async delete({ model, operation, args, query }) {
        // Convert delete to soft delete
        return (prisma as any)[model].update({
          ...args,
          data: { deletedAt: new Date() },
        });
      },
    },
  },
});
```

### 2.5 Audit Log / Versioning

```prisma
// Version tracking table
model EntityVersion {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  entityType String   @map("entity_type")  // "Order", "User", etc.
  entityId   String   @map("entity_id") @db.Uuid
  version    Int
  operation  String   // "CREATE", "UPDATE", "DELETE"
  changeset  Json     @db.JsonB  // { field: { old: x, new: y } }
  snapshot   Json     @db.JsonB  // Full entity state at this version
  changedBy  String   @map("changed_by") @db.Uuid
  changedAt  DateTime @default(now()) @map("changed_at")
  
  @@unique([entityType, entityId, version])
  @@index([entityType, entityId, changedAt(sort: Desc)])
  @@map("entity_versions")
  @@schema("versioning")
}
```

```typescript
// Extension-based audit logging
const auditedPrisma = prisma.$extends({
  query: {
    order: {
      async update({ args, query }) {
        const before = await prisma.order.findUnique({ where: args.where });
        const result = await query(args);
        
        if (before) {
          const changeset = diffObjects(before, result);
          await prisma.entityVersion.create({
            data: {
              entityType: 'Order',
              entityId: before.id,
              version: await getNextVersion('Order', before.id),
              operation: 'UPDATE',
              changeset,
              snapshot: result as any,
              changedBy: getCurrentUserId(), // from AsyncLocalStorage context
            },
          });
        }
        return result;
      },
    },
  },
});
```

---

## 3. Migration System (QUAN TRỌNG NHẤT)

> [!CAUTION]
> **Migration là nơi Prisma gây nhiều incident nhất trong production**. Hiểu rõ phần này để tránh data loss.

### 3.1 `migrate dev` vs `migrate deploy` — Bản chất bên trong

```
prisma migrate dev (DEVELOPMENT ONLY)
├── 1. Tạo Shadow Database (clone schema, empty data)
├── 2. Apply tất cả existing migrations lên Shadow DB
├── 3. Compare Shadow DB schema vs schema.prisma
├── 4. Generate new migration SQL
├── 5. Apply migration lên Development DB
├── 6. Re-generate Prisma Client
└── 7. Drop Shadow Database

prisma migrate deploy (PRODUCTION)
├── 1. Đọc _prisma_migrations table
├── 2. Tìm migrations chưa applied
├── 3. Apply theo thứ tự
└── 4. KHÔNG tạo Shadow DB, KHÔNG generate SQL mới
```

> [!CAUTION]
> **KHÔNG BAO GIỜ chạy `migrate dev` trong production**:
> - Nó cần quyền CREATE DATABASE (tạo shadow DB)
> - Nó có thể **drop và recreate tables** nếu detect drift
> - Nó sẽ fail nếu DB user không có đủ permissions

### 3.2 Shadow Database — Kẻ gây họa thầm lặng

Shadow database là temporary database mà Prisma tạo để:
1. Replay tất cả migrations từ đầu → Kiểm tra migration chain integrity
2. So sánh kết quả với `schema.prisma` → Detect drift

**Vấn đề**:
```bash
# Lỗi thường gặp:
# Error: P3006 - Migration `20230101_init` failed to apply cleanly to the shadow database

# Nguyên nhân:
# 1. Migration chứa SQL mà shadow DB không hiểu (TimescaleDB extension, custom functions)
# 2. Migration phụ thuộc vào data tồn tại (UPDATE ... SET ... WHERE)
# 3. Migration tham chiếu object ngoài Prisma control
```

**Fix cho TimescaleDB**:
```sql
-- Migration file: 20230101_init/migration.sql
-- Prisma không biết về TimescaleDB, phải thêm manual:

-- Đảm bảo extension tồn tại (idempotent)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Tạo table trước
CREATE TABLE "tracking"."location_points" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "device_id" UUID NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "recorded_at" TIMESTAMPTZ NOT NULL,
  "metadata" JSONB
);

-- Convert sang hypertable SAU khi tạo table
-- LƯU Ý: Nếu table đã có data, phải dùng migrate_data => true
SELECT create_hypertable(
  'tracking.location_points', 
  'recorded_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);
```

> [!WARNING]
> **TimescaleDB + Prisma Migration Pitfall**:
> - `DROP TABLE` trên hypertable cần `CASCADE` vì TimescaleDB tạo internal chunks
> - Bạn đã fix đúng trong migration file: `DROP TABLE "tracking"."location_points" CASCADE;`
> - Shadow database sẽ fail nếu TimescaleDB extension chưa install → Cần custom shadow DB URL hoặc skip shadow DB

```bash
# Option 1: Custom shadow database URL (có TimescaleDB)
# .env
SHADOW_DATABASE_URL="postgresql://user:pass@localhost:5432/shadow_db"

# schema.prisma
datasource db {
  provider          = "postgresql"
  url               = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
}

# Option 2: Skip shadow DB (prisma migrate diff)
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datamodel prisma/schema-new.prisma \
  --script > migration.sql
```

### 3.3 Migration Conflict & Drift

**Drift** = Database schema khác với migration history expected state.

```bash
# Detect drift
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma

# Nếu có drift:
# Option 1: Mark migration as applied (nếu DB đã đúng, chỉ thiếu record)
npx prisma migrate resolve --applied "20230101_migration_name"

# Option 2: Mark as rolled back
npx prisma migrate resolve --rolled-back "20230101_migration_name"

# Option 3: Baseline (khi adopt Prisma cho existing DB)
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

npx prisma migrate resolve --applied 0_init
```

### 3.4 Zero-Downtime Migration Strategies

> [!IMPORTANT]
> **Rule #1**: Mọi migration PHẢI backward compatible. Code cũ phải chạy được với schema mới.

**Pattern: Expand → Migrate → Contract**

```
Phase 1 (Expand): Thêm column mới, KHÔNG xóa column cũ
Phase 2 (Migrate): Deploy code mới, backfill data
Phase 3 (Contract): Xóa column cũ (sau khi confirm code cũ không còn chạy)
```

**Ví dụ: Rename column `name` → `full_name`**

```sql
-- Migration 1: EXPAND (safe, backward compatible)
ALTER TABLE "users" ADD COLUMN "full_name" TEXT;
-- Backfill (chạy trong background job, KHÔNG trong migration)
-- UPDATE "users" SET "full_name" = "name" WHERE "full_name" IS NULL;

-- Deploy code mới: đọc full_name, fallback name
-- Chờ rollout xong 100%

-- Migration 2: CONTRACT (chỉ khi code cũ đã tắt hết)
ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL;
ALTER TABLE "users" DROP COLUMN "name";
```

> [!CAUTION]
> **CÁC MIGRATION NGUY HIỂM (có thể lock table)**:
> ```sql
> -- ❌ LOCK toàn bộ table (trên bảng lớn = downtime)
> ALTER TABLE orders ADD COLUMN total DECIMAL NOT NULL DEFAULT 0;
> -- PostgreSQL < 11 phải rewrite toàn bộ table
> 
> -- ✅ SAFE: Thêm column nullable trước, sau đó backfill + set NOT NULL
> ALTER TABLE orders ADD COLUMN total DECIMAL;
> -- Backfill in batches...
> ALTER TABLE orders ALTER COLUMN total SET NOT NULL;
> ALTER TABLE orders ALTER COLUMN total SET DEFAULT 0;
> 
> -- ❌ LOCK: CREATE INDEX (blocking)
> CREATE INDEX idx_orders_status ON orders(status);
> 
> -- ✅ SAFE: CREATE INDEX CONCURRENTLY (non-blocking, nhưng chậm hơn)
> CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);
> -- LƯU Ý: Prisma generate CREATE INDEX, KHÔNG có CONCURRENTLY
> -- → Phải edit migration SQL thủ công!
> ```

### 3.5 Khi nào viết SQL migration thủ công

**Luôn viết thủ công khi**:
1. Tạo index `CONCURRENTLY`
2. Thêm partial index, expression index
3. Tạo/modify hypertable (TimescaleDB)
4. Data backfill
5. Tạo extensions, custom types, functions, triggers
6. Enum modifications (Prisma handle enum rất tệ trong PostgreSQL)

```bash
# Tạo migration trống để viết SQL thủ công
npx prisma migrate dev --create-only --name "add_gin_index_metadata"

# Edit file migration.sql
# Sau đó apply
npx prisma migrate dev
```

```sql
-- prisma/migrations/20230615_add_gin_index/migration.sql
-- Manual migration: GIN index for JSONB search

-- Wrap trong transaction
BEGIN;

-- GIN index cho JSONB querying
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_metadata_gin 
ON "core"."orders" USING GIN ("metadata");

-- Partial index cho active orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_active 
ON "core"."orders" ("user_id", "created_at" DESC) 
WHERE "deleted_at" IS NULL;

COMMIT;

-- LƯU Ý: CREATE INDEX CONCURRENTLY không thể chạy trong transaction!
-- Phải tách ra:
-- File 1: migration.sql (non-concurrent ops in transaction)
-- File 2: Chạy concurrent index riêng qua script
```

> [!WARNING]
> `CREATE INDEX CONCURRENTLY` **không thể chạy trong transaction**. Prisma wrap migration trong transaction mặc định. Cần thêm comment đặc biệt:
> ```sql
> -- prisma/migrations/xxx/migration.sql
> -- CreateIndex CONCURRENTLY phải chạy ngoài transaction
> CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table(column);
> ```
> Hoặc chạy index creation riêng qua script, không qua Prisma migrate.

---

## 4. Query Optimization

### 4.1 N+1 Problem trong Prisma

```typescript
// ❌ N+1: 1 query cho users + N queries cho orders
const users = await prisma.user.findMany();
for (const user of users) {
  const orders = await prisma.order.findMany({
    where: { userId: user.id }
  });
}
// Total queries: 1 + N

// ✅ Prisma tự xử lý N+1 khi dùng include (batched IN queries)
const users = await prisma.user.findMany({
  include: { orders: true }
});
// Total queries: 2 (1 for users, 1 for orders with WHERE userId IN (...))

// ⚠️ NHƯNG nếu include sâu nhiều level:
const users = await prisma.user.findMany({
  include: {
    orders: {
      include: {
        items: {
          include: {
            product: {
              include: { category: true }
            }
          }
        }
      }
    }
  }
});
// Total queries: 5 (1 per level) — vẫn acceptable
// NHƯNG data transfer lớn → giải quyết bằng select
```

### 4.2 `select` vs `include` vs Raw Query

```typescript
// 🔴 include: Lấy ALL columns + relation
const user = await prisma.user.findUnique({
  where: { id },
  include: { orders: true } // SELECT * FROM orders
});

// 🟡 select: Chỉ lấy columns cần thiết (RECOMMENDED)
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    orders: {
      select: {
        id: true,
        status: true,
        total: true,
      },
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }
  }
});

// 🟢 Raw query: Khi cần performance tối đa hoặc complex query
const result = await prisma.$queryRaw<OrderSummary[]>`
  SELECT 
    u.id,
    u.name,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent,
    MAX(o.created_at) as last_order_at
  FROM identity.users u
  LEFT JOIN core.orders o ON u.id = o.user_id AND o.deleted_at IS NULL
  WHERE u.id = ${userId}
  GROUP BY u.id, u.name
`;
```

> [!TIP]
> **Rule of Thumb**:
> - CRUD đơn giản → `select` (type-safe, maintainable)
> - Aggregation, reporting → `$queryRaw` (performance)
> - Bulk operations → `$executeRaw` (không cần return data)
> - **Không bao giờ** dùng `include` không filter trong API endpoint public

### 4.3 Pagination: Cursor vs Offset

```typescript
// ❌ Offset pagination: O(n) — chậm dần khi page lớn
// OFFSET 100000 = DB phải scan 100000 rows rồi skip
const orders = await prisma.order.findMany({
  skip: page * pageSize,  // skip = OFFSET
  take: pageSize,         // take = LIMIT
  orderBy: { createdAt: 'desc' },
});

// ✅ Cursor pagination: O(1) — consistent performance
const orders = await prisma.order.findMany({
  take: pageSize,
  cursor: lastCursorId ? { id: lastCursorId } : undefined,
  skip: lastCursorId ? 1 : 0, // Skip the cursor itself
  orderBy: { createdAt: 'desc' },
});

// ✅ Keyset pagination (raw SQL, tốt nhất cho performance)
const orders = await prisma.$queryRaw`
  SELECT * FROM core.orders
  WHERE created_at < ${lastCreatedAt}
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT ${pageSize}
`;
// Cần index trên (created_at DESC) WHERE deleted_at IS NULL
```

**Trade-off**:

| | Offset | Cursor |
|---|---|---|
| Random page access | ✅ Có | ❌ Không |
| Performance stable | ❌ Chậm dần | ✅ O(1) |
| Data consistency | ❌ Drift khi insert/delete | ✅ Consistent |
| Implementation | Simple | Complex |
| Use case | Admin panels | Public API, infinite scroll |

### 4.4 Transactions & Isolation Levels

```typescript
// 1. Interactive transaction (recommended cho business logic)
const result = await prisma.$transaction(async (tx) => {
  const order = await tx.order.findUnique({
    where: { id: orderId },
  });
  
  if (!order || order.status !== 'PENDING') {
    throw new Error('Order not available');
  }
  
  // Cả 2 operations trong 1 transaction
  const updated = await tx.order.update({
    where: { id: orderId },
    data: { status: 'CONFIRMED' },
  });
  
  await tx.orderEvent.create({
    data: {
      orderId,
      type: 'CONFIRMED',
      metadata: { confirmedBy: userId },
    },
  });
  
  return updated;
}, {
  maxWait: 5000,     // Max time to wait for transaction slot
  timeout: 10000,    // Max time transaction can run
  isolationLevel: 'Serializable', // Strongest isolation
});

// 2. Batch transaction (cho independent operations)
const [users, orders] = await prisma.$transaction([
  prisma.user.findMany(),
  prisma.order.findMany(),
]);
```

> [!WARNING]
> **Transaction Pitfalls**:
> 1. **Long-running transactions** = lock contention = deadlock
>    - Đừng gọi external API trong transaction
>    - Đừng process heavy logic trong transaction
> 2. **Serializable isolation** = retry needed
>    ```typescript
>    async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
>      for (let i = 0; i < retries; i++) {
>        try {
>          return await fn();
>        } catch (e) {
>          if (e.code === 'P2034' && i < retries - 1) { // Serialization failure
>            await new Promise(r => setTimeout(r, Math.random() * 100));
>            continue;
>          }
>          throw e;
>        }
>      }
>      throw new Error('Transaction failed after retries');
>    }
>    ```
> 3. **Prisma interactive transactions** giữ connection open → Pool exhaustion nếu nhiều concurrent transactions

### 4.5 Performance Tuning

```typescript
// 1. Logging slow queries
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'warn', emit: 'stdout' },
    { level: 'error', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 100) { // Log queries > 100ms
    logger.warn({
      query: e.query,
      params: e.params,
      duration: e.duration,
      target: e.target,
    }, 'Slow query detected');
  }
});

// 2. Connection pool monitoring
// Trong docker-compose hoặc infrastructure:
// Set PG config:
// - max_connections = 200
// - Prisma connection_limit = 10 per service instance
// - 20 instances × 10 = 200 connections → matched

// 3. Query analysis
const explain = await prisma.$queryRaw`
  EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  SELECT * FROM core.orders 
  WHERE user_id = ${userId} 
  AND created_at > ${startDate}
  ORDER BY created_at DESC 
  LIMIT 20
`;
// Check for: Seq Scan (bad), Index Scan (good), Bitmap Heap Scan (ok)
```

---

## 5. Prisma trong Microservices

### 5.1 Database per Service Pattern

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  User Service   │     │  Order Service   │     │ Tracking Service │
│  (Prisma)       │     │  (Prisma)        │     │  (Prisma + Raw)  │
└────────┬────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                       │                         │
    ┌────▼────┐           ┌──────▼──────┐          ┌───────▼──────┐
    │ User DB │           │  Order DB   │          │ Tracking DB  │
    │ (PG)    │           │  (PG)       │          │ (TimescaleDB)│
    └─────────┘           └─────────────┘          └──────────────┘
```

```typescript
// Mỗi service có Prisma schema riêng, DB riêng
// user-service/prisma/schema.prisma
model User {
  id    String @id @db.Uuid
  email String @unique
  name  String
  // KHÔNG có relation tới Order hay Tracking
  // Cross-service data = qua API hoặc event
  @@map("users")
}

// order-service/prisma/schema.prisma
model Order {
  id     String @id @db.Uuid
  userId String @map("user_id") @db.Uuid  // FK logic, KHÔNG có @relation
  status OrderStatus
  total  Decimal @db.Decimal(12,2)
  // userId là "soft reference" — không enforce ở DB level
  @@map("orders")
}
```

### 5.2 Cross-Service Data: API Composition

```typescript
// ❌ KHÔNG BAO GIỜ join cross-service ở DB level
// Dù cùng PostgreSQL instance, dùng schema khác cũng KHÔNG join

// ✅ API Composition / BFF Pattern
class OrderController {
  async getOrderWithUser(orderId: string) {
    const order = await this.orderService.findById(orderId);
    
    // Gọi User Service qua gRPC/HTTP
    const user = await this.userClient.getUser(order.userId);
    
    return { ...order, user };
  }
  
  // Batch API call để tránh N+1 cross-service
  async getOrdersWithUsers(orderIds: string[]) {
    const orders = await this.orderService.findByIds(orderIds);
    const userIds = [...new Set(orders.map(o => o.userId))];
    
    // 1 batch call thay vì N calls
    const users = await this.userClient.batchGetUsers(userIds);
    const userMap = new Map(users.map(u => [u.id, u]));
    
    return orders.map(o => ({
      ...o,
      user: userMap.get(o.userId),
    }));
  }
}
```

### 5.3 Event-Driven Consistency (Prisma + Kafka/Redpanda)

```typescript
// Transactional Outbox Pattern — Đảm bảo event được publish
// Bước 1: Write to DB + Outbox trong cùng transaction

model OutboxEvent {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  aggregateId String   @map("aggregate_id") @db.Uuid
  eventType   String   @map("event_type")
  payload     Json     @db.JsonB
  published   Boolean  @default(false)
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([published, createdAt])
  @@map("outbox_events")
}

// Service code
async createOrder(data: CreateOrderDto) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data });
    
    // Write event to outbox (same transaction = atomic)
    await tx.outboxEvent.create({
      data: {
        aggregateId: order.id,
        eventType: 'ORDER_CREATED',
        payload: order as any,
      },
    });
    
    return order;
  });
}

// Bước 2: Background worker polls outbox → publish to Kafka
async publishOutboxEvents() {
  const events = await prisma.outboxEvent.findMany({
    where: { published: false },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  
  for (const event of events) {
    await kafkaProducer.send({
      topic: `events.${event.eventType.toLowerCase()}`,
      messages: [{
        key: event.aggregateId,
        value: JSON.stringify(event.payload),
      }],
    });
    
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { published: true },
    });
  }
}
```

### 5.4 Saga Pattern

```typescript
// Saga cho Order flow: Create Order → Reserve Inventory → Charge Payment
enum SagaStatus {
  STARTED = 'STARTED',
  INVENTORY_RESERVED = 'INVENTORY_RESERVED',
  PAYMENT_CHARGED = 'PAYMENT_CHARGED',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  FAILED = 'FAILED',
}

async function createOrderSaga(data: CreateOrderInput) {
  const sagaId = randomUUID();
  
  try {
    // Step 1: Create order (local)
    const order = await prisma.order.create({
      data: { ...data, status: 'PENDING', sagaId },
    });
    
    // Step 2: Reserve inventory (remote service via event)
    await publishEvent('INVENTORY_RESERVE_REQUESTED', {
      sagaId,
      orderId: order.id,
      items: data.items,
    });
    
    // Saga continues via event handlers...
    // Nếu step nào fail → emit compensation events
    
  } catch (error) {
    // Compensate: cancel order
    await prisma.order.update({
      where: { sagaId },
      data: { status: 'CANCELLED' },
    });
    
    await publishEvent('ORDER_SAGA_COMPENSATE', { sagaId });
    throw error;
  }
}
```

---

## 6. Prisma với PostgreSQL Nâng Cao

### 6.1 JSONB — Khi nào nên và không nên

```typescript
// ✅ JSONB TỐT cho:
// 1. Metadata linh hoạt, schema-less
// 2. Settings/preferences mà mỗi user khác nhau
// 3. Event payload
// 4. API response caching

model Order {
  id       String @id @db.Uuid
  metadata Json?  @db.JsonB
  // metadata: { source: "web", coupon: "SUMMER23", notes: "..." }
}

// Query JSONB
const orders = await prisma.order.findMany({
  where: {
    metadata: {
      path: ['source'],
      equals: 'web',
    },
  },
});

// Complex JSONB query → Raw SQL
const orders = await prisma.$queryRaw`
  SELECT * FROM core.orders
  WHERE metadata @> '{"source": "web"}'::jsonb
  AND metadata->>'coupon' IS NOT NULL
  AND (metadata->>'priority')::int > 5
`;

// ❌ JSONB KHÔNG TỐT cho:
// 1. Data cần JOIN, aggregate thường xuyên
// 2. Data có schema cố định → Dùng columns
// 3. Data cần unique constraints
// 4. Data lớn (> 1MB per document) → Performance issue
// 5. Data cần partial update thường xuyên → Full rewrite mỗi lần update
```

> [!TIP]
> **JSONB Performance**:
> - GIN index cho `@>` operator (containment): `CREATE INDEX USING GIN(metadata)`
> - Expression index cho specific path: `CREATE INDEX ON orders ((metadata->>'source'))`
> - `jsonb_path_query` cho complex filtering (PG 12+)

### 6.2 Full-Text Search

```sql
-- Migration thủ công: Tạo tsvector column + GIN index
ALTER TABLE core.orders ADD COLUMN search_vector tsvector;

CREATE INDEX idx_orders_search ON core.orders USING GIN(search_vector);

-- Trigger để auto-update search_vector
CREATE OR REPLACE FUNCTION core.orders_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_search_update
  BEFORE INSERT OR UPDATE ON core.orders
  FOR EACH ROW EXECUTE FUNCTION core.orders_search_trigger();
```

```typescript
// Query full-text search via raw SQL
async searchOrders(query: string, limit = 20) {
  return prisma.$queryRaw`
    SELECT 
      id, title, description,
      ts_rank(search_vector, plainto_tsquery('english', ${query})) as rank
    FROM core.orders
    WHERE search_vector @@ plainto_tsquery('english', ${query})
      AND deleted_at IS NULL
    ORDER BY rank DESC
    LIMIT ${limit}
  `;
}
```

### 6.3 TimescaleDB Integration

```prisma
// Schema: Prisma chỉ biết đây là table thường
model LocationPoint {
  id         String   @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deviceId   String   @map("device_id") @db.Uuid
  latitude   Float
  longitude  Float
  altitude   Float?
  speed      Float?
  accuracy   Float?
  recordedAt DateTime @map("recorded_at") @db.Timestamptz(3)
  metadata   Json?    @db.JsonB
  
  // TimescaleDB hypertable KHÔNG có traditional PK
  // Prisma cần PK → dùng composite
  @@id([id, recordedAt])
  @@index([deviceId, recordedAt(sort: Desc)])
  @@map("location_points")
  @@schema("tracking")
}
```

```sql
-- Manual migration: Convert to hypertable
SELECT create_hypertable(
  'tracking.location_points',
  'recorded_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Compression policy (quan trọng cho storage)
ALTER TABLE tracking.location_points SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id',
  timescaledb.compress_orderby = 'recorded_at DESC'
);

SELECT add_compression_policy(
  'tracking.location_points',
  INTERVAL '7 days'
);

-- Retention policy (auto-delete old data)
SELECT add_retention_policy(
  'tracking.location_points',
  INTERVAL '90 days'
);

-- Continuous Aggregate (materialized view, auto-refresh)
CREATE MATERIALIZED VIEW tracking.hourly_device_stats
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 hour', recorded_at) AS bucket,
  COUNT(*) as point_count,
  AVG(speed) as avg_speed,
  MAX(speed) as max_speed,
  ST_MakeLine(
    array_agg(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) ORDER BY recorded_at)
  ) as track_line
FROM tracking.location_points
GROUP BY device_id, bucket;
```

```typescript
// Querying TimescaleDB through Prisma
// Simple queries → Prisma Client
const recentPoints = await prisma.locationPoint.findMany({
  where: {
    deviceId,
    recordedAt: {
      gte: new Date(Date.now() - 3600_000), // Last hour
    },
  },
  orderBy: { recordedAt: 'desc' },
  take: 100,
});

// TimescaleDB-specific features → Raw SQL
const hourlyStats = await prisma.$queryRaw`
  SELECT 
    time_bucket('1 hour', recorded_at) as bucket,
    COUNT(*) as count,
    AVG(speed) as avg_speed
  FROM tracking.location_points
  WHERE device_id = ${deviceId}
    AND recorded_at > NOW() - INTERVAL '24 hours'
  GROUP BY bucket
  ORDER BY bucket DESC
`;

// Batch insert for high-throughput tracking
async insertLocationBatch(points: LocationInput[]) {
  // Prisma createMany cho moderate throughput
  await prisma.locationPoint.createMany({
    data: points,
    skipDuplicates: true,
  });
  
  // For high throughput (10k+ points/sec) → use pg COPY
  // const copyStream = client.query(copyFrom(
  //   "COPY tracking.location_points FROM STDIN WITH (FORMAT csv)"
  // ));
}
```

---

## 7. Error Handling & Debugging

### 7.1 Common Prisma Errors

```typescript
import { Prisma, PrismaClientKnownRequestError } from '@prisma/client';

async function handlePrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // P2002: Unique constraint violation
      case 'P2002': {
        const fields = (error.meta?.target as string[])?.join(', ');
        throw new ConflictException(
          `Duplicate value for: ${fields}`
        );
      }
      
      // P2003: Foreign key constraint violation
      case 'P2003': {
        throw new BadRequestException(
          `Referenced record not found: ${error.meta?.field_name}`
        );
      }
      
      // P2025: Record not found (update/delete)
      case 'P2025':
        throw new NotFoundException('Record not found');
      
      // P2034: Transaction conflict (write conflict in serializable)
      case 'P2034':
        // Retry logic
        throw new ConflictException('Transaction conflict, retry');
      
      default:
        throw new InternalServerErrorException(
          `Database error: ${error.code}`
        );
    }
  }
  
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    // Usually raw SQL errors
    logger.error({ error }, 'Unknown Prisma error');
    throw new InternalServerErrorException('Database error');
  }
  
  if (error instanceof Prisma.PrismaClientInitializationError) {
    // Connection failed
    logger.fatal({ error }, 'Database connection failed');
    process.exit(1); // Let orchestrator restart
  }
  
  throw error;
}
```

### 7.2 Migration Errors

```bash
# P3006: Migration failed to apply
# Nguyên nhân: SQL syntax error, constraint violation, missing extension
# Fix:
# 1. Check migration SQL file
# 2. Fix SQL
# 3. prisma migrate resolve --rolled-back <migration_name>
# 4. Re-run prisma migrate dev

# P3009: Migration found applied but missing in migration directory  
# Nguyên nhân: Someone deleted migration file
# Fix:
# 1. NEVER delete migration files
# 2. Create new migration that reverses the changes
# 3. Hoặc: prisma migrate resolve --rolled-back <migration_name>

# P3014: Shadow database issue
# Nguyên nhân: Cannot create shadow database
# Fix: Set shadowDatabaseUrl in schema.prisma
```

### 7.3 Debugging Slow Queries

```typescript
// 1. Enable query logging
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
  ],
});

// 2. Structured logging with pino
import pino from 'pino';
const logger = pino({ level: 'info' });

prisma.$on('query', (e) => {
  logger.info({
    query: e.query,
    params: e.params,
    duration: `${e.duration}ms`,
    timestamp: e.timestamp,
  }, `prisma:query`);
});

// 3. OpenTelemetry integration
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

registerInstrumentations({
  instrumentations: [
    new PrismaInstrumentation({
      middleware: true, // Trace middleware execution
    }),
  ],
});

// 4. EXPLAIN ANALYZE bất kỳ query nào
async function explainQuery(sql: string) {
  const result = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ${sql}`
  );
  return result;
}
```

---

## 8. Best Practices Production

### 8.1 CI/CD Migration Strategy

```yaml
# .github/workflows/deploy.yml
name: Deploy with Migration

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      # 1. Checkout code
      - uses: actions/checkout@v4
      
      # 2. Install dependencies  
      - run: npm ci
      
      # 3. Generate Prisma Client
      - run: npx prisma generate
      
      # 4. Dry-run migration check
      - name: Check migration status
        run: npx prisma migrate status
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      # 5. Apply migration (TRƯỚC khi deploy code mới)
      - name: Apply migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      # 6. Deploy application
      - name: Deploy
        run: ./deploy.sh
```

```
Deployment Order (QUAN TRỌNG):
1. Run migration (backward compatible)
2. Deploy new code (canary/rolling)
3. Verify
4. (Optional) Run contract migration (remove old columns)

KHÔNG BAO GIỜ:
- Deploy code trước migrate → Code reference columns chưa tồn tại
- Rename column trong 1 step → Old code break
- Drop column mà code cũ còn chạy → P2022 error
```

### 8.2 Seeding Strategy

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Idempotent seeding — safe to run multiple times
  
  // 1. Upsert reference data
  const roles = ['ADMIN', 'USER', 'MODERATOR'];
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role, description: `${role} role` },
    });
  }
  
  // 2. Upsert system user
  await prisma.user.upsert({
    where: { email: 'system@internal' },
    update: {},
    create: {
      email: 'system@internal',
      name: 'System',
      role: 'ADMIN',
    },
  });
  
  // 3. Development-only seed data
  if (process.env.NODE_ENV === 'development') {
    await seedDevData();
  }
}

async function seedDevData() {
  // Faker data for development
  const { faker } = await import('@faker-js/faker');
  
  for (let i = 0; i < 100; i++) {
    await prisma.user.create({
      data: {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        orders: {
          create: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
            status: faker.helpers.arrayElement(['PENDING', 'CONFIRMED', 'SHIPPED']),
            total: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }),
          })),
        },
      },
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### 8.3 Backup & Rollback

```bash
# Pre-migration backup (LUÔN backup trước migrate)
#!/bin/bash
# scripts/backup-before-migrate.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${TIMESTAMP}.sql"

# Backup with pg_dump
pg_dump $DATABASE_URL \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE}"

# Upload to S3
aws s3 cp "${BACKUP_FILE}" "s3://backups/db/${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_FILE}"

# Run migration
npx prisma migrate deploy

# If migration fails → rollback
# pg_restore --dbname=$DATABASE_URL --clean "${BACKUP_FILE}"
```

> [!CAUTION]
> **Prisma KHÔNG có rollback migration built-in**. Khi migration fail:
> 1. Fix migration SQL
> 2. `prisma migrate resolve --rolled-back <name>`
> 3. Re-run `prisma migrate deploy`
> 4. Hoặc restore from backup
>
> **Luôn có backup trước khi migrate production.**

---

## 9. Anti-Patterns (Cực kỳ quan trọng)

### 9.1 ❌ Lạm dụng Prisma cho mọi thứ

```typescript
// ❌ Anti-pattern: Force Prisma cho aggregation query
const stats = await prisma.order.groupBy({
  by: ['status'],
  _count: { id: true },
  _sum: { total: true },
  _avg: { total: true },
  where: {
    createdAt: { gte: startDate },
  },
});
// Prisma groupBy có nhiều limitations:
// - Không hỗ trợ HAVING clause phức tạp
// - Không hỗ trợ window functions
// - Không hỗ trợ subquery trong aggregation

// ✅ Dùng raw SQL cho những gì Prisma không giỏi
const stats = await prisma.$queryRaw`
  WITH monthly_stats AS (
    SELECT 
      date_trunc('month', created_at) as month,
      status,
      COUNT(*) as count,
      SUM(total) as revenue,
      AVG(total) as avg_order_value,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total) as median_value
    FROM core.orders
    WHERE created_at >= ${startDate}
      AND deleted_at IS NULL
    GROUP BY month, status
  )
  SELECT 
    *,
    LAG(revenue) OVER (PARTITION BY status ORDER BY month) as prev_month_revenue,
    revenue - LAG(revenue) OVER (PARTITION BY status ORDER BY month) as growth
  FROM monthly_stats
  ORDER BY month DESC, status
`;
```

### 9.2 ❌ Include quá sâu (Data overfetching)

```typescript
// ❌ Lấy toàn bộ tree — response 10MB, latency 2s
const user = await prisma.user.findUnique({
  where: { id },
  include: {
    orders: {
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
                reviews: true,
                variants: true,
              }
            }
          }
        },
        payments: true,
        shipping: true,
      }
    },
    addresses: true,
    reviews: true,
  }
});
// SQL: 8+ queries, fetch hàng nghìn rows

// ✅ Select chỉ những gì cần
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    email: true,
    orders: {
      select: { id: true, status: true, total: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
      where: { deletedAt: null },
    },
  }
});
```

### 9.3 ❌ Không kiểm soát migration

```bash
# ❌ Anti-pattern: Auto-fix migration conflicts
# "Prisma nói migrate reset? OK, reset luôi!"
npx prisma migrate reset  # ← XÓA TOÀN BỘ DATA

# ❌ Delete migration files khi conflict
rm -rf prisma/migrations/20230101_*  # ← KHÔNG BAO GIỜ

# ❌ Force push schema lên production
npx prisma db push  # ← KHÔNG DÙNG TRONG PRODUCTION (skip migration history)

# ✅ Giải quyết đúng cách:
# 1. Hiểu tại sao conflict xảy ra
# 2. Merge migration files đúng cách
# 3. Test migration trên staging DB trước
# 4. prisma migrate resolve nếu cần
```

### 9.4 ❌ Connection Pool không đúng

```typescript
// ❌ Tạo Prisma Client mới mỗi request
app.get('/users', async (req, res) => {
  const prisma = new PrismaClient(); // ← MỖI REQUEST = 1 connection pool mới
  const users = await prisma.user.findMany();
  res.json(users);
  // QUÊN disconnect → connection leak
});

// ✅ Singleton pattern
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'warn', 'error'] 
      : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
```

### 9.5 ❌ Enum Migration Trap

```prisma
// ❌ Đổi tên enum value = DATA LOSS trong PostgreSQL
enum OrderStatus {
  PENDING
  CONFIRMED  // Đổi thành ACCEPTED → Prisma DROP & CREATE enum
  SHIPPED    // → Tất cả rows có CONFIRMED bị mất
}
```

```sql
-- ✅ Thêm enum value: an toàn
ALTER TYPE "OrderStatus" ADD VALUE 'ACCEPTED';

-- ✅ Rename enum value (PG 10+): an toàn  
ALTER TYPE "OrderStatus" RENAME VALUE 'CONFIRMED' TO 'ACCEPTED';

-- ❌ Remove enum value: PostgreSQL KHÔNG hỗ trợ trực tiếp
-- Phải: tạo type mới → migrate data → swap → drop cũ
```

> [!CAUTION]
> **Prisma migration với enum rất nguy hiểm**. Nếu bạn rename/remove enum value, Prisma sẽ generate: `DROP TYPE → CREATE TYPE`. Tất cả columns dùng enum đó sẽ bị DROP.
> **Luôn review migration SQL trước khi apply**, đặc biệt khi modify enum.

---

## 10. Hands-on: GeoTrack System

Dựa trên project hiện tại của bạn, đây là architecture reference:

### 10.1 Schema Design

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["identity", "core", "tracking", "versioning"]
}

// ═══════════════════════════════════════
// Identity Schema
// ═══════════════════════════════════════
model User {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email        String    @unique
  passwordHash String    @map("password_hash")
  name         String
  role         UserRole  @default(USER)
  isActive     Boolean   @default(true) @map("is_active")
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  deletedAt    DateTime? @map("deleted_at")
  
  sessions     Session[]
  devices      Device[]
  
  @@index([email]) // Covering index for login
  @@index([role, isActive])
  @@map("users")
  @@schema("identity")
}

model Session {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  token        String   @unique
  refreshToken String   @unique @map("refresh_token")
  familyId     String   @map("family_id") @db.Uuid
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([familyId])
  @@index([expiresAt])
  @@map("sessions")
  @@schema("identity")
}

// ═══════════════════════════════════════
// Core Schema
// ═══════════════════════════════════════
model Device {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  name        String
  deviceType  String    @map("device_type")
  identifier  String    @unique // Device hardware ID
  isActive    Boolean   @default(true) @map("is_active")
  lastSeenAt  DateTime? @map("last_seen_at")
  metadata    Json?     @db.JsonB
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  
  user   User    @relation(fields: [userId], references: [id])
  tracks Track[]
  
  @@index([userId, isActive])
  @@map("devices")
  @@schema("core")
}

model Track {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deviceId    String      @map("device_id") @db.Uuid
  name        String?
  status      TrackStatus @default(RECORDING)
  startedAt   DateTime    @map("started_at")
  endedAt     DateTime?   @map("ended_at")
  distance    Float?      // meters, calculated
  duration    Int?        // seconds, calculated
  metadata    Json?       @db.JsonB
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")
  
  device Device @relation(fields: [deviceId], references: [id])
  
  @@index([deviceId, startedAt(sort: Desc)])
  @@index([status])
  @@map("tracks")
  @@schema("core")
}

// ═══════════════════════════════════════
// Tracking Schema (TimescaleDB)
// ═══════════════════════════════════════
model LocationPoint {
  id         String   @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  trackId    String   @map("track_id") @db.Uuid
  deviceId   String   @map("device_id") @db.Uuid
  latitude   Float
  longitude  Float
  altitude   Float?
  speed      Float?
  bearing    Float?
  accuracy   Float?
  recordedAt DateTime @map("recorded_at") @db.Timestamptz(3)
  metadata   Json?    @db.JsonB
  
  @@id([id, recordedAt]) // Composite PK for hypertable
  @@index([trackId, recordedAt(sort: Desc)])
  @@index([deviceId, recordedAt(sort: Desc)])
  @@map("location_points")
  @@schema("tracking")
}

// ═══════════════════════════════════════
// Versioning Schema
// ═══════════════════════════════════════
model EntityVersion {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id") @db.Uuid
  version    Int
  operation  String
  changeset  Json     @db.JsonB
  snapshot   Json     @db.JsonB
  changedBy  String   @map("changed_by") @db.Uuid
  changedAt  DateTime @default(now()) @map("changed_at")
  
  @@unique([entityType, entityId, version])
  @@index([entityType, entityId, changedAt(sort: Desc)])
  @@map("entity_versions")
  @@schema("versioning")
}

// ═══════════════════════════════════════
// Enums
// ═══════════════════════════════════════
enum UserRole {
  ADMIN
  USER
  SERVICE_ACCOUNT
  
  @@schema("identity")
}

enum TrackStatus {
  RECORDING
  PAUSED
  COMPLETED
  CANCELLED
  
  @@schema("core")
}
```

### 10.2 Migration Strategy cho project này

```bash
# 1. Initial migration (bao gồm TimescaleDB setup)
npx prisma migrate dev --create-only --name "init_multi_schema"

# 2. Edit migration để thêm TimescaleDB specifics
```

```sql
-- prisma/migrations/0001_init_multi_schema/migration.sql

-- PHẦN 1: Extensions (Prisma không quản lý)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS postgis; -- Nếu cần spatial queries

-- PHẦN 2: Schemas (Prisma generated)
CREATE SCHEMA IF NOT EXISTS "identity";
CREATE SCHEMA IF NOT EXISTS "core";
CREATE SCHEMA IF NOT EXISTS "tracking";
CREATE SCHEMA IF NOT EXISTS "versioning";

-- PHẦN 3: Tables (Prisma generated - KEEP AS IS)
-- ... Prisma generated CREATE TABLE statements ...

-- PHẦN 4: TimescaleDB (Manual — AFTER table creation)
SELECT create_hypertable(
  'tracking.location_points',
  'recorded_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Compression policy
ALTER TABLE tracking.location_points SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id',
  timescaledb.compress_orderby = 'recorded_at DESC'
);

SELECT add_compression_policy(
  'tracking.location_points',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Retention policy
SELECT add_retention_policy(
  'tracking.location_points',
  INTERVAL '365 days',
  if_not_exists => TRUE
);
```

### 10.3 Optimized Queries

```typescript
// src/modules/tracking/tracking.service.ts

class TrackingService {
  constructor(private readonly prisma: PrismaClient) {}

  // High-throughput location ingestion
  async ingestBatch(points: LocationInput[]) {
    // Batch insert — Prisma handles chunking
    const result = await this.prisma.locationPoint.createMany({
      data: points.map(p => ({
        trackId: p.trackId,
        deviceId: p.deviceId,
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude,
        speed: p.speed,
        bearing: p.bearing,
        accuracy: p.accuracy,
        recordedAt: p.recordedAt,
        metadata: p.metadata ?? undefined,
      })),
      skipDuplicates: true,
    });
    
    // Update track's last known position (async, non-blocking)
    this.updateTrackStats(points[0].trackId).catch(err => {
      logger.error({ err, trackId: points[0].trackId }, 'Failed to update track stats');
    });
    
    return result;
  }

  // Get track with points using cursor pagination (TimescaleDB optimized)
  async getTrackPoints(
    trackId: string, 
    cursor?: { recordedAt: Date },
    limit = 100
  ) {
    if (cursor) {
      // Keyset pagination — O(1) performance on hypertable
      return this.prisma.$queryRaw`
        SELECT id, latitude, longitude, altitude, speed, bearing, 
               accuracy, recorded_at, metadata
        FROM tracking.location_points
        WHERE track_id = ${trackId}::uuid
          AND recorded_at < ${cursor.recordedAt}
        ORDER BY recorded_at DESC
        LIMIT ${limit}
      `;
    }
    
    // First page — use Prisma Client
    return this.prisma.locationPoint.findMany({
      where: { trackId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        latitude: true,
        longitude: true,
        altitude: true,
        speed: true,
        bearing: true,
        accuracy: true,
        recordedAt: true,
        metadata: true,
      },
    });
  }

  // Analytics: TimescaleDB time_bucket
  async getDeviceHourlyStats(deviceId: string, days = 7) {
    return this.prisma.$queryRaw`
      SELECT 
        time_bucket('1 hour', recorded_at) as bucket,
        COUNT(*) as point_count,
        AVG(speed) as avg_speed,
        MAX(speed) as max_speed,
        AVG(accuracy) as avg_accuracy,
        json_build_object(
          'lat', AVG(latitude),
          'lng', AVG(longitude)
        ) as center_point
      FROM tracking.location_points
      WHERE device_id = ${deviceId}::uuid
        AND recorded_at > NOW() - INTERVAL '${days} days'
      GROUP BY bucket
      ORDER BY bucket DESC
    `;
  }

  // Calculate track statistics
  private async updateTrackStats(trackId: string) {
    const stats = await this.prisma.$queryRaw<[{
      distance: number;
      duration: number;
      point_count: number;
    }]>`
      SELECT 
        -- Haversine distance calculation
        SUM(
          6371000 * acos(
            cos(radians(lat1)) * cos(radians(lat2)) *
            cos(radians(lng2) - radians(lng1)) +
            sin(radians(lat1)) * sin(radians(lat2))
          )
        ) as distance,
        EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at)))::int as duration,
        COUNT(*) as point_count
      FROM (
        SELECT
          latitude as lat1,
          longitude as lng1,
          LEAD(latitude) OVER (ORDER BY recorded_at) as lat2,
          LEAD(longitude) OVER (ORDER BY recorded_at) as lng2,
          recorded_at
        FROM tracking.location_points
        WHERE track_id = ${trackId}::uuid
      ) segments
      WHERE lat2 IS NOT NULL
    `;

    if (stats[0]) {
      await this.prisma.track.update({
        where: { id: trackId },
        data: {
          distance: stats[0].distance,
          duration: stats[0].duration,
        },
      });
    }
  }
}
```

### 10.4 Event Pipeline (Prisma + Redpanda)

```typescript
// src/modules/tracking/tracking.producer.ts
import { Kafka } from 'kafkajs';

class TrackingEventProducer {
  private producer;
  
  constructor(private prisma: PrismaClient) {
    const kafka = new Kafka({
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      clientId: 'geotrack-api',
    });
    this.producer = kafka.producer();
  }

  // Transactional Outbox: DB write + event in same transaction
  async recordLocationWithEvent(data: LocationInput) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Write location point
      const point = await tx.locationPoint.create({
        data: {
          trackId: data.trackId,
          deviceId: data.deviceId,
          latitude: data.latitude,
          longitude: data.longitude,
          speed: data.speed,
          recordedAt: data.recordedAt,
        },
      });

      // 2. Write to outbox (same transaction)
      await tx.outboxEvent.create({
        data: {
          aggregateId: data.trackId,
          eventType: 'LOCATION_RECORDED',
          payload: point as any,
        },
      });

      return point;
    });
  }

  // Outbox publisher (runs as cron job)
  async publishPendingEvents() {
    const events = await this.prisma.outboxEvent.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    if (events.length === 0) return;

    const messages = events.map(e => ({
      topic: `tracking.${e.eventType.toLowerCase()}`,
      messages: [{
        key: e.aggregateId,
        value: JSON.stringify(e.payload),
        timestamp: e.createdAt.getTime().toString(),
      }],
    }));

    await this.producer.sendBatch({ topicMessages: messages });

    // Mark as published
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: events.map(e => e.id) } },
      data: { published: true },
    });
  }
}
```

---

## Quick Reference Card

### Prisma CLI Commands Cheatsheet

| Command | Environment | Purpose |
|---------|------------|---------|
| `prisma migrate dev` | Development ONLY | Generate + apply migration |
| `prisma migrate deploy` | Production | Apply pending migrations |
| `prisma migrate status` | Any | Check migration status |
| `prisma migrate resolve` | Production | Fix stuck migrations |
| `prisma migrate diff` | Any | Compare schemas |
| `prisma migrate reset` | Development ONLY | ⚠️ DROP ALL + recreate |
| `prisma db push` | Prototyping ONLY | Push schema without migration |
| `prisma db pull` | Any | Introspect existing DB |
| `prisma generate` | Any | Regenerate Prisma Client |
| `prisma format` | Any | Format schema file |
| `prisma validate` | Any | Validate schema file |

### Mental Model: When to use what

```
Simple CRUD ──────────────── Prisma Client (findMany, create, update)
Filtered lists ───────────── Prisma Client + select
Aggregation ──────────────── $queryRaw
Bulk insert (< 10k) ─────── createMany
Bulk insert (> 10k) ─────── pg COPY / $executeRawUnsafe
Complex joins ────────────── $queryRaw  
TimescaleDB features ─────── $queryRaw
Full-text search ─────────── $queryRaw
Analytics / Reporting ────── $queryRaw or dedicated view
Real-time streaming ──────── Native pg driver (not Prisma)
```

---

> **Final Insight**: Prisma là abstraction layer tốt cho 80% use cases. Nhưng 20% còn lại — analytics, bulk ops, database-specific features — cần raw SQL. Senior engineer biết khi nào chuyển gear. Đừng fight the tool, dùng đúng tool cho đúng job.

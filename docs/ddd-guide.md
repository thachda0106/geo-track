# Kiến Thức Chuẩn về DDD — Ánh Xạ Vào Project Của Bạn

> Đây là cấu trúc **4 tầng** theo Clean Architecture + DDD, ánh xạ 1-1 vào `src/modules/geometry/`.

---

## Tổng Quan: Nguyên Tắc Bất Biến

```
Dependency Rule: Mũi tên phụ thuộc CHỈ được hướng vào trong.
Lớp ngoài biết lớp trong. Lớp trong KHÔNG ĐƯỢC biết lớp ngoài.

  ┌──────────────────────────────────────┐
  │  [4] Presentation (Controller/HTTP)  │  ← biết Application
  │  ┌────────────────────────────────┐  │
  │  │  [3] Application (Use-Cases)   │  │  ← biết Domain
  │  │  ┌──────────────────────────┐  │  │
  │  │  │  [2] Domain (Core)       │  │  │  ← không biết ai cả
  │  │  └──────────────────────────┘  │  │
  │  └────────────────────────────────┘  │
  │  [1] Infrastructure (DB/External)    │  ← biết tất cả (implement)
  └──────────────────────────────────────┘
```

> ⚠️ **Infrastructure là lớp ngoài cùng nhưng nó implement các interface từ lớp trong.**
> Đây là điểm gây nhầm lẫn nhất!

---

## Tầng 1: DOMAIN — "Trái Tim Của Hệ Thống"

**Vị trí trong project:** `geometry/domain/`

**Câu hỏi cốt lõi:** *"Hệ thống biết gì về thế giới thực?"*

Domain layer **không được import bất cứ thứ gì từ bên ngoài** (không NestJS, không Prisma, không HTTP).

### Những gì thuộc Domain:

#### Entity (`domain/entities/feature.entity.ts`)
- Là object có **danh tính (ID)** tồn tại theo thời gian
- Chứa **business logic thuần** (validate, tính toán)
- Không phụ thuộc vào bất kỳ framework nào

```ts
// ✅ ĐÚNG: Pure class, không import Prisma/NestJS
export class Feature {
  constructor(
    private readonly id: string,
    private name: string,
    private geometry: GeoJSON,
  ) {}

  rename(newName: string): void {
    if (!newName.trim()) throw new Error('Name cannot be empty');
    this.name = newName;
  }
}
```

#### Repository Interface (`domain/repositories/`)
- **Chỉ là interface** — định nghĩa "cần gì" từ storage
- Không biết Prisma hay PostgreSQL tồn tại

```ts
// ✅ ĐÚNG: Interface thuần, không biết Prisma
export interface IFeatureRepository {
  save(feature: Feature): Promise<void>;
  findById(id: string): Promise<Feature | null>;
  delete(id: string): Promise<void>;
}
export const FEATURE_REPOSITORY = Symbol('FEATURE_REPOSITORY');
```

#### Value Objects, Domain Events, Domain Services
- Các khái niệm khác thuộc domain (nếu cần)

---

## Tầng 2: APPLICATION — "Điều Phối Nghiệp Vụ"

**Vị trí trong project:** `geometry/application/`

**Câu hỏi cốt lõi:** *"Hệ thống làm gì? Các tác vụ là gì?"*

Application layer **điều phối** domain objects để thực hiện một use-case cụ thể.
Nó chỉ biết Domain, không biết Infrastructure hay HTTP.

### Những gì thuộc Application:

#### Use-Case / Command Handler (`application/use-cases/*.use-case.ts`)
- Mỗi file = 1 tác vụ nghiệp vụ
- Inject repository interface (Symbol token), KHÔNG inject class cụ thể

```ts
// ✅ ĐÚNG: Inject interface, không biết Prisma
@Injectable()
export class CreateFeatureUseCase {
  constructor(
    @Inject(FEATURE_REPOSITORY)
    private readonly repo: IFeatureRepository,
  ) {}

  async execute(dto: CreateFeatureDto): Promise<void> {
    const feature = new Feature(uuid(), dto.name, dto.geometry);
    await this.repo.save(feature);
  }
}
```

#### Query Port Interface (`application/use-cases/queries/geometry-queries.interface.ts`)
- **Đây chính là file bạn đang thắc mắc!**
- Đây là **Output Port** cho read-model (CQRS pattern)
- Định nghĩa "cần đọc dữ liệu gì" mà không biết làm thế nào

```ts
// ✅ ĐÚNG: Chỉ là contract, không có implementation
export const FEATURE_QUERIES = Symbol('FEATURE_QUERIES');
export interface IFeatureQueries {
  listFeatures(query: FeatureListQuery): Promise<...>;
  getFeature(id: string): Promise<FeatureDto>;
}
```

> **Tại sao là interface chứ không phải class?**
> Vì Application layer KHÔNG ĐƯỢC biết rằng data đến từ Prisma/PostgreSQL.
> Nó chỉ biết "tôi cần data theo hình dạng này".

#### DTOs (`application/dtos/`)
- Dữ liệu đầu vào/đầu ra cho use-cases
- Khác với entity — đây là data transfer, không có behavior

---

## Tầng 3: INFRASTRUCTURE — "Làm Thế Nào"

**Vị trí trong project:** `geometry/infrastructure/`

**Câu hỏi cốt lõi:** *"Hệ thống lưu trữ và tích hợp bên ngoài như thế nào?"*

Infrastructure là lớp **implement các interface** được định nghĩa ở Domain và Application.
Nó là lớp DUY NHẤT được biết Prisma, PostgreSQL, Redis, Kafka...

### Những gì thuộc Infrastructure:

#### Repository Implementation (`infrastructure/persistence/prisma-feature.repository.ts`)
- Implement `IFeatureRepository` từ Domain
- Sử dụng Prisma để thực sự truy vấn DB

```ts
// ✅ ĐÚNG: Biết Prisma, implement interface từ Domain
@Injectable()
export class PrismaFeatureRepository implements IFeatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(feature: Feature): Promise<void> {
    await this.prisma.feature.upsert({ ... });
  }
}
```

#### Query Implementation (`infrastructure/persistence/prisma-geometry-queries.ts`)
- Implement `IFeatureQueries` và `ISpatialQueries` từ Application
- Đây là nơi PostGIS queries "khủng" thực sự sống

```ts
// ✅ ĐÚNG: Implement Query Port từ Application
@Injectable()
export class PrismaGeometryQueries implements IFeatureQueries, ISpatialQueries {
  async listFeatures(query: FeatureListQuery) {
    // Truy vấn PostGIS thực sự ở đây
    return this.prisma.$queryRaw`SELECT ...`;
  }
}
```

---

## Tầng 4: PRESENTATION — "Giao Tiếp Với Bên Ngoài"

**Vị trí trong project:** `geometry/presentation/`

**Câu hỏi cốt lõi:** *"Hệ thống nói chuyện với client như thế nào?"*

### Những gì thuộc Presentation:

#### Controller (`presentation/geometry.controller.ts`)
- Nhận HTTP request
- Parse/validate input
- Gọi Use-Case hoặc Query Port
- Format response

```ts
// ✅ ĐÚNG: Inject use-case và query port qua Symbol
@Controller('features')
export class GeometryController {
  constructor(
    private readonly createFeature: CreateFeatureUseCase,
    @Inject(FEATURE_QUERIES)
    private readonly featureQueries: IFeatureQueries,
  ) {}

  @Post()
  create(@Body() dto: CreateFeatureDto) {
    return this.createFeature.execute(dto);
  }

  @Get()
  list(@Query() query: FeatureListQuery) {
    return this.featureQueries.listFeatures(query);  // ← Không cần use-case class
  }
}
```

---

## Kết Nối Tất Cả: Module Là "Dây Điện"

`geometry.module.ts` là nơi **wire dependencies** — kết nối interface với implementation:

```ts
@Module({
  providers: [
    // Command side
    CreateFeatureUseCase,
    UpdateFeatureUseCase,
    DeleteFeatureUseCase,

    // Wire: Domain Repository Interface → Infrastructure Implementation
    {
      provide: FEATURE_REPOSITORY,
      useClass: PrismaFeatureRepository,
    },

    // Wire: Application Query Port → Infrastructure Implementation
    {
      provide: FEATURE_QUERIES,
      useClass: PrismaGeometryQueries,
    },
    {
      provide: SPATIAL_QUERIES,
      useClass: PrismaGeometryQueries,
    },
  ],
  controllers: [GeometryController, SpatialController],
})
export class GeometryModule {}
```

---

## Sơ Đồ Hoàn Chỉnh Của Project

```
geometry/
│
├── domain/                          ← [Lõi] Không phụ thuộc gì
│   ├── entities/
│   │   └── feature.entity.ts        Entity + business logic
│   └── repositories/
│       └── feature.repository.ts    Interface (contract với storage)
│
├── application/                     ← [Điều Phối] Chỉ biết Domain
│   ├── dtos/
│   │   ├── geometry.dto.ts          Input/Output DTOs
│   │   └── spatial-query.dto.ts
│   └── use-cases/
│       ├── create-feature.use-case.ts   Command handlers
│       ├── update-feature.use-case.ts
│       ├── delete-feature.use-case.ts
│       └── queries/
│           └── geometry-queries.interface.ts  ← Query Port (interface)
│
├── infrastructure/                  ← [Kỹ Thuật] Biết tất cả, implement interface
│   └── persistence/
│       ├── prisma-feature.repository.ts     Implement Domain repo interface
│       └── prisma-geometry-queries.ts       Implement Application query port
│
├── presentation/                    ← [HTTP] Giao tiếp với client
│   ├── geometry.controller.ts       CRUD controllers
│   └── spatial.controller.ts        Spatial query controllers
│
└── geometry.module.ts               ← Wire everything together
```

---

## Quy Tắc Nhớ Nhanh

| Tầng | Được phép import | Không được import |
|------|-----------------|-------------------|
| **Domain** | Không ai | Tất cả |
| **Application** | Domain | Infrastructure, NestJS HTTP, Prisma |
| **Infrastructure** | Domain, Application, Prisma | — |
| **Presentation** | Application (use-cases, ports) | Domain trực tiếp, Infrastructure |

---

## Tại Sao Cấu Trúc Này?

| Lợi ích | Giải thích |
|---------|-----------|
| **Testability** | Use-cases test được mà không cần DB thật (mock interface) |
| **Replaceability** | Đổi Prisma sang TypeORM chỉ cần sửa Infrastructure |
| **Business isolation** | Business logic trong Domain không bị ô nhiễm bởi framework |
| **CQRS rõ ràng** | Command = Use-Case classes, Query = Query Port interfaces |

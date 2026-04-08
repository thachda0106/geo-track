# 🚀 GeoTrack: Senior Onboarding & Learning Plan

Chào mừng bạn gia nhập dự án **GeoTrack**! Đây là tài liệu hướng dẫn (Onboarding Plan) được thiết kế đặc biệt dành cho cấp độ Senior Engineer, giúp bạn nhanh chóng nắm bắt bức tranh tổng thể, các luồng kiến trúc cốt lõi và lộ trình tiếp cận source code hiệu quả nhất.

> [!NOTE]
> GeoTrack giải quyết bài toán song song: **"Git cho bản đồ"** (versioning từng thay đổi tọa độ) và **"Tracking Real-time"** (hứng và xử lý lượng lớn GPS data). Do đó, dự án này đậm chất Data-Intensive Application.

---

## 🗺️ 1. Mental Model (Bức tranh tổng thể)

Hệ thống được thiết kế theo kiến trúc **Modular Monolith** sử dụng **NestJS**, bao gồm các luồng (flows) kết hợp giữa đồng bộ (Sync API) và bất đồng bộ chuyên sâu (Async Events, Queue). 

*   **Runtime:** Node.js 20 LTS + TypeScript + NestJS
*   **Database:** PostgreSQL (Core) + PostGIS (Geometry) + TimescaleDB (Time-series)
*   **Streaming & Cache:** Redpanda (Kafka) + Redis (Pub/Sub + Caching)
*   **Deployment:** Docker Compose (Local) / Kubernetes (Prod)

Bạn có thể tìm thấy toàn bộ thiết kế kiến trúc chuẩn mực trong thư mục `docs/`.

---

## 📚 2. Cấu trúc Source Code & Bounded Contexts

Project được chia thành 4 context chính độc lập về mặt DB Schema và Logic, nằm tại `src/modules/`:

### 🛡️ 1. Identity Module (`src/modules/identity`)
*   **Trách nhiệm:** Quản lý Auth, Role (RBAC) và thông tin User. 
*   **Lưu ý cho Senior:** Chú ý cách implementation JWT stateless, refresh-token rotation và rate limit (ngăn chặn brute-force).

### 📐 2. Geometry Module (`src/modules/geometry`)
*   **Trách nhiệm:** Quản lý các vector/polygon/point trên bản đồ. Sử dụng PostGIS cho các operations như Intersect, Contain, Buffer...
*   **Lưu ý cho Senior:** Luồng xử lý Transactional Outbox. Khi lưu một Geometry mới, một event được tạo ra cùng transaction của DB và đẩy xuống bảng `outbox` để trigger versioning.

### ⏳ 3. Versioning Module (`src/modules/versioning`)
*   **Trách nhiệm:** Là "Git" của hệ thống map. Lưu các snapshot, diff và timeline.
*   **Lưu ý cho Senior:** Nhận event từ Kafka (từ Outbox của Geometry truyền tới) thông qua Inbox table để đảm bảo logic lưu version là *Exactly-Once/Idempotent*.

### 📡 4. Tracking Module (`src/modules/tracking`)
*   **Trách nhiệm:** Nhận data tọa độ real-time từ số lượng lớn thiết bị IoT.
*   **Lưu ý cho Senior:** Data đi qua Kafka -> Worker (Kalman filter loại bỏ nhiễu) -> TimescaleDB (micro-batching insert) -> Redis Pub/Sub -> WebSocket cho Map Client.

### 🔧 5. Core Libraries (`libs/core/src`)
Cung cấp các common utilities: logging dạng JSON (Pino), Health checks, Configuration (Zod validation), Event Outbox logic, và Circuit Breaker pattern cho resilience.

---

## ⚙️ 3. Các Cơ chế Cốt lõi (Critical Mechanisms)

Là Senior, bạn nên review kỹ 3 mô hình kỹ thuật xương sống của dự án:

> [!IMPORTANT]
> **Transactional Outbox / Inbox Pattern**
> System không ghi trực tiếp event vào Kafka sau khi commit DB (nguy cơ mất event). Thay vào đó, nó ghi event vào bảng `geometry.outbox` trong cùng Database Transaction. Thư mục `src/workers/outbox-worker.ts` sẽ poll hoặc listen changes để đẩy lên Kafka (Redpanda). Phía Consumer dùng Inbox Pattern chặn duplicate.

> [!TIP]
> **High-Throughput Ingestion với TimescaleDB**
> Tại `tracking` module, thay vì insert từng point GPS lên RDS gây nghẽn, system sử dụng Kafka để buffer và đẩy micro-batch (vài nghìn records/lần) vào TimescaleDB (Hypertable theo ngày). 

> [!NOTE]
> **Realtime WebSocket & Pub/Sub Fan-out**
> Để chịu tải 10k-50k con-current connections, WebSocket server đẩy push thông qua Redis Pub/sub. Các "rooms" chia theo Bounding Box (BBOX) dựa vào Tile Coordinate để push data chỉ đúng vào client đang xem mảng map đó.

---

## 🏃 4. Roadmap Learning & Hands-on cho 2 Tuần Đầu

Dưới đây là action plan để bạn nắm bắt toàn bộ workflow của dự án:

### Tuần 1: Khám phá Core Flow & Code Architecture

- **Ngày 1 - 2: System Specs & Docs Reader**
  - Đọc `README.md` để khởi chạy project local với `npm run docker:up`.
  - Đọc `docs/01-business-domain-discovery.md`: Giúp hiểu bài toán business, user persona và Non-Functional Requirements (NFR).
  - Đọc `docs/04-system-flows-tech-stack.md`: Cực kỳ quan trọng để nhìn được sequence diagrams của tất cả luồng.
  
- **Ngày 3 - 4: Geometry CRUD & Versioning Flow**
  - Đi theo luồng API tạo một Feature (Polygon). Nhìn vào `src/modules/geometry`.
  - Trace code xem cách Event được sinh ra tại Outbox và Kafka.
  - Review `src/modules/versioning` để xem cách Consumer bắt event và tạo snapshot/diff.

- **Ngày 5: Auth & Configuration**
  - Review `libs/core` xem cách config system.
  - Đọc phần auth guard middleware và RBAC interceptors.

### Tuần 2: Xử lý High-load & Cloud Resilience

- **Ngày 6 - 7: Tracking Ingestion & Kafka**
  - Mở `docs/system-knowledge/03_data_flow_streaming_redpanda.md` và `docs/system-knowledge/database_design_deep_dive.md`.
  - Review module `tracking` làm cách nào handle 50k RPS lúc peak load. Đặc biệt module áp dụng Kalman Filter.
  
- **Ngày 8 - 9: WebSocket & Caching**
  - Đọc `docs/system-knowledge/real_time_layer_deep_dive.md`.
  - Xem mô hình Redis caching, rate-limiting, circuit-breaker interceptors ở `libs/core/src/resilience`.

- **Ngày 10: Infrastructure, Helm / K8s**
  - Xem `k8s/` và `docker-compose.yml`. Review network routing và config cho Production K8S deployment (ví dụ `k8s/base/deployment-worker.yaml`).

---

## ❓ Câu hỏi bạn nên tự mở ra khi tìm hiểu

1. Việc scale-up `outbox-worker.ts` hiện tại được thiết kế như thế nào để tránh worker conflict?
2. Nếu PostGIS gặp slow-queries lớn, GiST index hiện tại đã tối ưu tốt nhất cho Bound Box check (`&&`) chưa?
3. Với lượng GPS bị out-of-order cực lớn, system làm sao vẽ được timeline chuẩn?

Hãy bắt đầu đọc từ thư mục `/docs` rồi nhảy vào `src/main.ts` để bám cọc từ ngoài vào. Cần support mảng cụ thể nào, mong bạn đưa ra yêu cầu ở đây nhé! Happy Coding! 💻🚀

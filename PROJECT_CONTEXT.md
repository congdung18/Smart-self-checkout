# TÀI LIỆU NGỮ CẢNH DỰ ÁN (PROJECT CONTEXT BRIEF)

> **Dự án**: Smart Self-Checkout (Hệ thống Quầy thanh toán tự phục vụ)  
> **Phiên bản tài liệu**: 1.0.0 | **Ngày lập**: 16/11/2026  
> **Mục tiêu tài liệu**: Cung cấp bức tranh toàn diện, chính xác và có cơ sở về mã nguồn, cấu hình, dữ liệu và quy trình để kỹ sư mới có thể tiếp nhận và can thiệp mã nguồn an toàn mà không làm gãy vỡ hệ thống.

---

## 1. Tổng quan dự án

Smart Self-Checkout là hệ thống quầy thanh toán tự phục vụ hoàn chỉnh dành cho cửa hàng bán lẻ và siêu thị mini. Dự án giải quyết bài toán tự động hóa luồng mua hàng trực tiếp của khách hàng vô danh (quét mã vạch sản phẩm qua camera/nhập tay, tự quản lý giỏ hàng, giữ tồn kho nguyên tử chống bán vượt, thanh toán QR không tiền mặt qua cổng giả lập và xuất hóa đơn điện tử), đồng thời cung cấp cổng quản trị bảo mật phân quyền theo vai trò (RBAC) cho Nhân viên (giám sát giỏ hàng theo thời gian thực) và Quản trị viên (quản lý danh mục, tồn kho và báo cáo doanh thu).

---

## 2. Tech Stack & Công nghệ sử dụng

| Phân hệ | Công nghệ / Thư viện | Phiên bản | Bằng chứng khai báo | Ghi chú vai trò |
| :--- | :--- | :--- | :--- | :--- |
| **Runtime & Language** | Node.js | `>=24.0.0 <25` | `package.json:6-8` | Yêu cầu Node 24 ESM |
| | TypeScript | `5.9.3` | `package.json:74` | Toàn bộ mã nguồn BE, FE, Tools |
| **Backend Framework** | Express | `5.1.0` | `package.json:43` | Framework REST API |
| | helmet | `8.1.0` | `package.json:46` | Bảo vệ HTTP headers |
| | express-rate-limit | `8.7.3` | `package.json:44` | Giới hạn tần suất gọi API / đăng nhập |
| | express-session | `1.18.2` | `package.json:45` | Quản lý session cookie máy chủ |
| | connect-pg-simple | `10.0.0` | `package.json:42` | Lưu trữ session trong bảng PostgreSQL |
| **Cơ sở dữ liệu & ORM** | PostgreSQL | `18.6` | `compose.yaml:3` | CSDL quan hệ chính |
| | embedded-postgres | `18.6.0-beta.19` | `package.json:66` | Driver chạy DB cục bộ không cần Docker |
| | Prisma ORM | `7.10.1` | `package.json:41,71` | Quản trị schema, migration và truy vấn |
| | pg (@prisma/adapter-pg)| `8.16.3` / `7.10.1` | `package.json:40,47` | Kết nối pool PostgreSQL |
| **Frontend Framework** | React | `19.3.1` | `package.json:49-50` | Giao diện Single Page Application |
| | Vite | `7.3.7` | `package.json:76` | Trình đóng gói & máy chủ dev FE |
| | Native CSS | - | `frontend/src/style.css` | Giao diện thích ứng (360/768/1280px), WCAG |
| **Validation & Tiện ích** | Zod | `4.6.7` | `package.json:51` | Xác thực dữ liệu đầu vào DTO/Schema |
| | qrcode | `1.5.4` | `package.json:48` | Sinh chuỗi data URL ảnh QR thanh toán |
| **Kiểm thử (Testing)** | Node.js Test Runner | Native (`node:test`) | `package.json:20-22` | Runner chạy unit và integration test |
| | Supertest | `7.1.4` | `package.json:72` | Kiểm thử tích hợp HTTP API |
| | Playwright | `1.64.1` | `package.json:69` | Kiểm thử E2E trình duyệt headless |
| | @axe-core/playwright | `4.14.0` | `package.json:54` | Quét tiêu chuẩn trợ năng tiếp cận WCAG |
| **Linter & Formatter** | ESLint | `9.39.1` | `package.json:67` | Phân tích tĩnh cú pháp |
| | Prettier | `3.9.10` | `package.json:70` | Chuẩn hóa định dạng mã nguồn |

---

## 3. Cấu trúc thư mục

```text
.
├── backend/                  # Toàn bộ mã nguồn máy chủ backend và cổng thanh toán
│   ├── src/
│   │   ├── adapters/         # Adapter kết nối giao tiếp ngoại vi (gateway.adapter.ts)
│   │   ├── config/           # Cấu hình môi trường và khởi tạo kết nối DB (config.ts, db.ts)
│   │   ├── controllers/      # Tầng điều khiển HTTP: nhận request, validate DTO (api, gateway)
│   │   ├── middlewares/      # Middleware: Auth RBAC, CSRF, Session, RateLimit, Error handler
│   │   ├── repositories/     # Tầng truy cập dữ liệu: Prisma SQL queries và transaction
│   │   ├── routes/           # Khai báo đường dẫn API routes (api.routes.ts, gateway.routes.ts)
│   │   ├── services/         # Nghiệp vụ cốt lõi: Checkout, Giữ hàng, Thanh toán, User
│   │   ├── types/            # Khai báo kiểu TypeScript và mã lỗi DomainError
│   │   ├── utils/            # Tiện ích băm mật khẩu scrypt, chữ ký HMAC, SHA-256 digest
│   │   ├── validators/       # Zod schemas kiểm tra dữ liệu đầu vào
│   │   ├── app.ts            # Hàm xuất xưởng createApp cấu hình Express và middleware
│   │   ├── gateway-app.ts    # Ứng dụng Express riêng cho Mock Payment Gateway
│   │   ├── gateway-server.ts # Entrypoint chạy tiến trình Mock Gateway (cổng 3001)
│   │   ├── seed.ts           # Dữ liệu mẫu (sản phẩm, tài khoản admin/staff ban đầu)
│   │   └── server.ts         # Entrypoint chạy tiến trình Backend API chính (cổng 3000)
│   ├── tests/                # Bộ kiểm thử tích hợp backend (checkout.test.ts)
│   └── tsconfig.json         # Cấu hình TypeScript backend
├── frontend/                 # Ứng dụng giao diện khách hàng và quản trị (React + Vite)
│   ├── src/
│   │   ├── pages/            # Các trang giao diện: Customer.tsx, Admin.tsx, Login.tsx
│   │   ├── api.ts            # Client HTTP gọi backend, quản lý CSRF token
│   │   ├── components.tsx    # Các thành phần UI dùng chung (Modal, Loading, Error)
│   │   ├── main.tsx          # Điểm gắn kết React DOM (App component)
│   │   ├── routing.ts        # Định tuyến Client-side bằng Hash (#/customer/home, v.v.)
│   │   ├── Scanner.tsx       # Thành phần quét mã vạch qua Camera và ô nhập mã tay
│   │   └── style.css         # Định dạng giao diện CSS native
│   ├── index.html            # File HTML gốc của giao diện
│   ├── tsconfig.json         # Cấu hình TypeScript frontend
│   └── vite.config.ts        # Cấu hình Vite dev/build
├── prisma/                   # Quản lý cấu trúc cơ sở dữ liệu
│   ├── migrations/           # Các bản migration SQL đã sinh (202611050001_initial)
│   └── schema.prisma         # Khai báo 15 models dữ liệu Prisma
├── tools/                    # Bộ công cụ điều phối vòng đời local dev, test, backup
│   ├── backup.ts             # Sao lưu & phục hồi database nguyên tử (pg_dump/pg_restore)
│   ├── database-cli.ts       # CLI quản lý vòng đời cụm database (up, stop, status, adopt)
│   ├── docker-postgres.ts    # Điều phối container Docker PostgreSQL
│   ├── local.ts              # Nhạc trưởng chạy môi trường phát triển cục bộ (`npm run dev`)
│   ├── postgres.ts           # Trừu tượng hóa driver (Docker Compose hoặc Embedded Native)
│   ├── run-suite.ts          # Điều phối chạy các bộ kiểm thử cô lập
│   └── schema-compare.ts     # So sánh đối soát lược đồ DB thực tế với snapshot chuẩn
├── tests/                    # Bộ kiểm thử E2E trên trình duyệt (app.browser.cjs)
├── docs/                     # Tài liệu kỹ thuật, kế hoạch và báo cáo
│   ├── .gitignore            # Cô lập tài liệu nội bộ, chỉ công bố tài liệu được phép
│   ├── 05-release.md         # Quy trình đóng gói và phát hành
│   ├── Ke_hoach_trien_khai...# Kế hoạch triển khai tổng thể đồ án
│   └── report.md             # Báo cáo tổng hợp tính năng đã làm và khoảng trống kỹ thuật
├── compose.yaml              # Cấu hình Docker Compose cho PostgreSQL 18.6
├── eslint.config.mjs         # Cấu hình linter ESLint 9
├── package.json              # Khai báo dependencies và scripts thực thi
└── AGENTS.md                 # Quy tắc phát triển và chuẩn mực commit dành cho AI Agents
```

---

## 4. Kiến trúc hệ thống

Hệ thống được thiết kế theo **Mô hình kiến trúc phân tầng kỹ thuật nghiêm ngặt (Layered Technical Architecture)** dựa trên Quyết định kỹ thuật D01 (`docs/decisions/`):

```text
  [ Trình duyệt Khách hàng / Quản trị ]
                    │
                    ▼  (HTTP / Hash Navigation)
  ┌────────────────────────────────────────────────────────┐
  │  Frontend Single Page Application (React 19 + Vite)   │
  │  - routing.ts (Hash Router)                            │
  │  - api.ts (Fetch API Client kèm CSRF header)           │
  └────────────────────────┬───────────────────────────────┘
                           │
                           │  HTTP REST (Loopback 127.0.0.1:3000)
                           ▼
  ┌────────────────────────────────────────────────────────┐
  │  Backend Express Application (backend/src/app.ts)      │
  │  ├── Middlewares: Helmet, CSRF, Session, RateLimit,    │
  │  │               Staff/Admin RBAC, ErrorHandler        │
  │  ├── Routes (api.routes.ts)                            │
  │  ├── Controllers (api.controller.ts)                   │
  │  ├── Services (checkout.service.ts, application.ts)    │
  │  └── Repositories (checkout.repo.ts, application.repo) │
  └───────────────┬────────────────────────▲───────────────┘
                  │                        │
       Prisma SQL │             HMAC Signed│ Webhook Callback
       Connection │             (/v1/payment-events)
                  ▼                        │
  ┌────────────────────────┐      ┌────────┴───────────────┐
  │  PostgreSQL 18.6       │      │  Mock Payment Gateway  │
  │  (Bảng nghiệp vụ,      │◄────►│  (gateway-app.ts :3001)│
  │   Session, GatewayPay) │      │  - Sinh QR thanh toán  │
  └────────────────────────┘      │  - Giả lập kết quả     │
                                  └────────────────────────┘
```

* **Nguyên tắc giao tiếp nội bộ**:
  - `Controller` không truy vấn database trực tiếp; chỉ nhận request, chuyển đổi DTO và gọi `Service`.
  - `Service` quản lý toàn bộ nghiệp vụ, kiểm tra trạng thái, tính tiền và điều phối ngữ cảnh transaction (`tx`).
  - `Repository` đảm nhiệm toàn bộ câu lệnh Prisma/SQL và nhận `tx` được truyền từ `Service`.
  - Giữa Backend API và Mock Payment Gateway dùng chung một cơ sở dữ liệu vật lý nhưng kết nối độc lập; việc hoàn tất thanh toán bắt buộc phải thông qua Webhook có kiểm tra chữ ký HMAC SHA-256 (`x-signature`).

---

## 5. Các luồng nghiệp vụ chính

### Luồng 1: Khách hàng quét mã vạch và thêm vào giỏ hàng
1. **Quét / Nhập mã**: Khách dùng camera quét barcode hoặc nhập mã tay (`frontend/src/Scanner.tsx`).
2. **Xem trước sản phẩm**: Client gọi `GET /v1/products?code=<barcode>` (`frontend/src/api.ts → lookupProduct()`).
   - Xử lý tại `backend/src/controllers/api.controller.ts → lookup()`.
   - Tìm kiếm qua `backend/src/services/application.service.ts → lookup()`.
   - Nếu tìm thấy nhiều hơn 1 hoặc không thấy -> bắn lỗi `PRODUCT_NOT_FOUND` hoặc `PRODUCT_CODE_AMBIGUOUS`.
3. **Thêm vào giỏ**: Khách bấm "Thêm vào giỏ" -> Client gọi `POST /v1/carts/:id/items` kèm `idempotencyKey`.
   - Xử lý tại `backend/src/services/checkout.service.ts → mutate({ kind: "add" })`.
   - Khóa bản ghi giỏ hàng bằng `lockCart(tx, id, owner)`.
   - Kiểm tra trùng lặp qua bảng `CartOperation` (nếu trùng key và hash -> bỏ qua idempotently; nếu trùng key sai hash -> báo `KEY_REUSED`).
   - Kiểm tra tồn kho khả dụng tức thời: `quantity > (onHand - reserved) -> INSUFFICIENT_STOCK`.
   - Cập nhật số lượng qua `tx.upsertItem()` và lưu dấu vết thao tác `tx.rememberOperation()`.

### Luồng 2: Khóa giỏ hàng & Đặt giữ tồn kho (Checkout Reservation)
1. **Bấm thanh toán**: Khách bấm "Thanh toán" -> Client gọi `POST /v1/carts/:id/payments` với `PaymentInput` (chứa `acceptedAmount`, `version`, `key`).
2. **Xác thực trạng thái giỏ**: `backend/src/services/checkout.service.ts → prepare()`.
   - Khóa giỏ hàng `lockCart()`, kiểm tra giỏ đang `active` và đúng `version`.
   - Đóng băng giỏ hàng và kiểm tra giá không bị đổi (`PRICE_CHANGED`).
3. **Giữ hàng nguyên tử (Atomic Reservation)**:
   - Sắp xếp thứ tự các dòng sản phẩm theo `productId` tăng dần (chống deadlock).
   - Thực thi câu lệnh SQL nguyên tử trực tiếp trong `backend/src/repositories/checkout.repository.ts → reserve()`:
     `UPDATE "Stock" SET reserved = reserved + $qty WHERE "productId" = $id AND ("onHand" - reserved) >= $qty`.
   - Nếu bất kỳ dòng nào không khớp (`rowsAffected !== 1`) -> `DomainError("INSUFFICIENT_STOCK")` kích hoạt rollback toàn bộ các lượt giữ trước đó trong transaction.
4. **Tạo Payment Record**: Lưu bản ghi `Payment` với `status = "initiating"`, `completion = "waiting"` kèm bản chụp snapshot các dòng hàng.

### Luồng 3: Thanh toán QR & Xác nhận Webhook hoàn tất đơn hàng
1. **Khởi tạo cổng thanh toán**: `backend/src/services/payment.service.ts → GatewayClient.initiate()`.
   - Gửi yêu cầu HTTP POST tới Mock Gateway (`:3001/payments`) kèm chữ ký HMAC SHA-256.
   - Gateway tạo bản ghi `GatewayPayment` và trả về `qrContent`.
   - Frontend hiển thị mã QR thanh toán trên màn hình cho khách (`frontend/src/pages/Customer.tsx`).
2. **Xử lý Webhook thanh toán**: Khi người dùng quét thanh toán hoặc bấm mô phỏng kết quả (`/payments/:id/outcome` hoặc `/v1/payments/:id/simulate`).
   - Gateway gửi POST tới `/v1/payment-events` kèm header `x-signature: sha256=...`.
   - Middleware `backend/src/middlewares/security.ts → callbackSignature()` kiểm tra chữ ký HMAC.
   - `backend/src/services/checkout.service.ts → apply()` ghi nhận `PaymentEvent` (chống lặp bằng `eventId`).
   - **Nếu thất bại (`status = "failure"`)**: Giải phóng hàng giữ:
     `UPDATE "Stock" SET reserved = reserved - $qty WHERE "productId" = $id AND reserved >= $qty`
     và chuyển trạng thái reservation sang `released`.
   - **Nếu thành công (`status = "success"`)**: Gọi tiếp `complete(paymentId)`.
3. **Hoàn tất xuất kho & Đơn hàng (`complete()`)**:
   - Tạo bản ghi `Order` và các `OrderItem`.
   - Trừ kho thực tế: `UPDATE "Stock" SET onHand = onHand - $qty, reserved = reserved - $qty`.
   - Chuyển `Payment.status = "success"`, `Payment.completion = "completed"`, `Cart.status = "completed"`.
   - Chuyển trạng thái reservation sang `consumed`.
4. **Khôi phục hóa đơn sau F5**: Client lưu mã đơn hàng vào `sessionStorage` và phục hồi hiển thị qua `GET /v1/carts/current` (`frontend/src/pages/Customer.tsx:85-110`).

### Luồng 4: Đăng nhập & Phân quyền Quản trị (Staff / Admin RBAC)
1. **Đăng nhập**: User gửi POST `/v1/auth/login` với `{ username, password }`.
   - Giới hạn tần suất gọi: `loginLimit()` (5 lần/phút) chống dò mật khẩu.
   - `backend/src/services/application.service.ts → login()`: Truy vấn user trong PostgreSQL.
   - Băm mật khẩu và so sánh an toàn: `backend/src/utils/security.ts → verifyPassword()` dùng thuật toán `scrypt` kết hợp `timingSafeEqual` chống tấn công timing attack.
   - Lưu thông tin user vào `req.session.userId`.
2. **Kiểm tra quyền truy cập**:
   - `backend/src/middlewares/auth.ts → staffAuthentication(application, adminOnly)`:
     - Chưa đăng nhập -> HTTP 401 `AUTH_REQUIRED`.
     - Yêu cầu Admin nhưng role là Staff -> HTTP 403 `FORBIDDEN`.
     - Staff được truy cập: Giám sát giỏ hàng (`GET /v1/monitoring/carts`), tra cứu (`GET /v1/products`).
     - Admin được toàn quyền: Quản lý danh mục/tồn kho (`/v1/inventory`, `/v1/admin/products`), Báo cáo doanh thu (`GET /v1/reports`).

---

## 6. Mô hình dữ liệu (Data Model)

Khai báo tại `prisma/schema.prisma` gồm 15 Models:

| Model | Mục đích | Khóa chính | Quan hệ chính |
| :--- | :--- | :--- | :--- |
| **`Product`** | Danh mục sản phẩm kinh doanh | `id` (UUID) | 1:1 `Stock`, 1:N `CartItem`, 1:N `Reservation`, 1:N `OrderItem` |
| **`Stock`** | Số lượng tồn kho thực tế (`onHand`) và số lượng đang giữ (`reserved`) | `id` (UUID) | 1:1 với `Product` (onDelete: Restrict) |
| **`Cart`** | Giỏ hàng của khách (`ownerId`, `status`: active, completed, cancelled) | `id` (UUID) | 1:N `CartItem`, 1:N `Payment`, 1:1 `Order`, 1:N `CartOperation` |
| **`CartItem`** | Từng món hàng trong giỏ (`quantity`, `unitPrice`) | `id` (UUID) | N:1 `Cart`, N:1 `Product` (Unique: `cartId` + `productId`) |
| **`CartOperation`**| Bản ghi chống lặp thao tác sửa giỏ (`key`, `digest`) | `id` (UUID) | N:1 `Cart` (Unique: `cartId` + `key`) |
| **`Payment`** | Giao dịch thanh toán (`amount`, `status`, `completion`, `snapshot`) | `id` (UUID) | N:1 `Cart`, 1:N `Reservation`, 1:N `PaymentEvent`, 1:1 `Order` |
| **`Reservation`**| Bản ghi đặt giữ hàng tồn kho (`quantity`, `status`: held, released, consumed) | `id` (UUID) | N:1 `Payment`, N:1 `Product` (Unique: `paymentId` + `productId`) |
| **`Order`** | Đơn hàng hoàn tất chính thức (`amount`, `completedAt`) | `id` (UUID) | 1:1 `Cart`, 1:1 `Payment`, 1:N `OrderItem` |
| **`OrderItem`** | Chi tiết món hàng trong đơn (chốt tên, SKU, barcode, giá lúc mua) | `id` (UUID) | N:1 `Order`, N:1 `Product`, 1:1 `StockMovement` |
| **`StockMovement`**| Bản ghi xuất kho tương ứng với món hàng đã bán | `id` (UUID) | 1:1 `OrderItem` |
| **`PaymentEvent`**| Dấu vết sự kiện webhook từ cổng thanh toán (`eventId`, `digest`, `status`)| `id` (UUID) | N:1 `Payment` |
| **`User`** | Tài khoản nhân viên/quản trị (`username`, `passwordHash`, `role`: staff/admin) | `id` (UUID) | Độc lập |
| **`Session`** | Bảng phiên làm việc (`sid`, `sess`, `expire`) của connect-pg-simple | `sid` (VarChar) | Độc lập (Map sang bảng CSDL `session`) |
| **`GatewayPayment`**| Bản ghi thanh toán nội bộ của Mock Gateway (`amount`, `status`, `scenario`) | `id` (UUID) | Độc lập |

* **Ràng buộc toàn vẹn quan trọng**:
  - `CHECK ("onHand" >= 0)` và `CHECK ("reserved" >= 0)`: Được cấu hình trong migration để ngăn chặn tuyệt đối lỗi âm kho ở cấp độ CSDL.
  - `CHECK ("reserved" <= "onHand")`: Đảm bảo không bao giờ giữ vượt quá số lượng hàng thực tế có trên kệ.

---

## 7. Danh mục API và Màn hình giao diện

### Danh mục REST API (`backend/src/routes/api.routes.ts`)

| Phương thức | Endpoint | Phân quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/health` | Public | Kiểm tra trạng thái kết nối DB |
| `GET` | `/v1/bootstrap` | Public | Lấy trạng thái khởi tạo client |
| `POST`| `/v1/auth/login` | Public (Rate limit) | Đăng nhập tài khoản Staff / Admin |
| `POST`| `/v1/auth/logout` | Session | Đăng xuất, hủy session |
| `GET` | `/v1/products` | Public | Tra cứu sản phẩm theo barcode/SKU |
| `GET` | `/v1/carts/current` | Cookie Session | Lấy giỏ hàng đang active hoặc đơn hàng vừa mua |
| `POST`| `/v1/carts` | Cookie Session | Tạo giỏ hàng mới |
| `GET` | `/v1/carts/:id` | Cookie Session | Lấy chi tiết giỏ hàng theo ID |
| `POST`| `/v1/carts/:id/items` | Cookie Session | Thêm sản phẩm vào giỏ (có idempotency key) |
| `PATCH`| `/v1/carts/:id/items/:itemId` | Cookie Session | Thay đổi số lượng món hàng |
| `DELETE`| `/v1/carts/:id/items/:itemId` | Cookie Session | Xóa 1 món khỏi giỏ hàng |
| `POST`| `/v1/carts/:id/cancel` | Cookie Session | Hủy toàn bộ giỏ hàng |
| `POST`| `/v1/carts/:id/payments` | Cookie Session | Khóa giỏ, giữ hàng, tạo giao dịch thanh toán |
| `GET` | `/v1/payments/:id` | Cookie Session | Xem trạng thái giao dịch thanh toán |
| `POST`| `/v1/payments/:id/simulate` | Cookie Session | Bấm nút mô phỏng kết quả (demo) |
| `POST`| `/v1/payment-events` | HMAC Signature | Webhook nhận kết quả từ Gateway |
| `GET` | `/v1/monitoring/carts` | Staff / Admin | Xem danh sách giỏ hàng theo thời gian thực |
| `GET` | `/v1/inventory` | Admin | Quản lý danh sách kho và tìm kiếm tồn kho |
| `POST`| `/v1/admin/products` | Admin | Tạo sản phẩm mới |
| `GET` | `/v1/admin/products/:id` | Admin | Xem chi tiết 1 sản phẩm |
| `PATCH`| `/v1/admin/products/:id` | Admin | Cập nhật thông tin/trạng thái sản phẩm |
| `GET` | `/v1/reports` | Admin | Báo cáo doanh thu & danh sách đơn hàng |

### Danh mục Màn hình Giao diện (`frontend/src/routing.ts`)

| Đường dẫn Hash | Component | Đối tượng sử dụng | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `#/customer/home` | `CustomerPage` | Khách hàng | Trang chủ chào mừng, nút bắt đầu mua sắm |
| `#/customer/scan` | `CustomerPage` + `Scanner` | Khách hàng | Quét mã vạch camera / nhập tay, xem preview |
| `#/customer/cart` | `CustomerPage` | Khách hàng | Xem bảng giỏ hàng, tăng/giảm số lượng, xóa giỏ |
| `#/customer/payment` | `CustomerPage` | Khách hàng | Hiển thị mã QR thanh toán động và nút trạng thái |
| `#/customer/receipt` | `CustomerPage` | Khách hàng | Hóa đơn xuất kho chi tiết sau khi thanh toán thành công |
| `#/login` | `LoginPage` | Nhân viên / Quản trị | Form đăng nhập tài khoản |
| `#/staff/sessions` | `MonitorPage` | Nhân viên & Admin | Theo dõi các quầy đang mở, snapshot giỏ đang thanh toán |
| `#/admin/inventory` | `ProductsPage` | Admin | Xem danh sách hàng, mức tồn kho, trạng thái bán |
| `#/admin/products/new` | `ProductForm` | Admin | Form thêm sản phẩm mới vào hệ thống |
| `#/admin/products/:id` | `ProductForm` | Admin | Form chỉnh sửa thông tin hoặc ngừng kinh doanh sản phẩm |
| `#/admin/reports` | `ReportsPage` | Admin | Báo cáo doanh thu theo ngày, số lượng đơn theo trạng thái |

---

## 8. Cấu hình & Môi trường thực thi

### Danh sách Biến môi trường (`.env.example`)

| Tên biến | Bắt buộc | Mục đích sử dụng | Giá trị mặc định / Demo |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | Có | Chuỗi kết nối PostgreSQL (có user, pass, db) | Do `tools/local.ts` tự sinh động |
| `SESSION_SECRET` | Có | Khóa bí mật ký session cookie Express | Chuỗi ngẫu nhiên 32 bytes |
| `PAYMENT_SECRET` | Có | Khóa bí mật ký và xác thực webhook HMAC SHA-256 | Chuỗi ngẫu nhiên 32 bytes |
| `PUBLIC_ORIGIN` | Có | URL gốc của frontend (dùng cho CORS & CSRF check) | `http://127.0.0.1:5173` |
| `GATEWAY_URL` | Có | URL của tiến trình Mock Payment Gateway | `http://127.0.0.1:3001` |
| `CALLBACK_URL` | Có | Webhook endpoint Backend nhận kết quả thanh toán | `http://127.0.0.1:3000/v1/payment-events` |
| `PORT` | Không | Cổng chạy Backend API | `3000` |
| `GATEWAY_PORT` | Không | Cổng chạy Mock Gateway | `3001` |
| `STAFF_PASSWORD` | Không | Mật khẩu tài khoản `staff` khi khởi tạo DB | Mặc định lưu trong `.runtime/app.json` |
| `ADMIN_PASSWORD` | Không | Mật khẩu tài khoản `admin` khi khởi tạo DB | Mặc định lưu trong `.runtime/app.json` |
| `SSC_DB_DRIVER` | Không | Chọn driver DB (`docker` hoặc `native`) | `docker` (hoặc `native` nếu truyền cờ) |
| `BACKUP_DIRECTORY`| Không | Thư mục lưu file sao lưu cơ sở dữ liệu | Cục bộ |

### Lệnh thực thi chính (`package.json:9-38`)

* **Khởi chạy ứng dụng**:
  ```bash
  npm run dev          # Chạy full-stack với PostgreSQL trên Docker Compose (yêu cầu Docker Desktop)
  npm run dev:native   # Chạy full-stack với PostgreSQL nhúng sẵn (KHÔNG cần Docker Desktop)
  ```
  *(Khi muốn dừng toàn bộ, gõ `stop` trong terminal rồi Enter).*

* **Biên dịch & Kiểm tra chất lượng**:
  ```bash
  npm run build        # Tạo Prisma client + biên dịch TS backend/frontend + Vite build
  npm run lint         # Kiểm tra linter ESLint
  npm run format:check # Kiểm tra định dạng Prettier
  ```

* **Kiểm thử tự động**:
  ```bash
  npm run test:docker         # Chạy 24 test tích hợp backend trên PostgreSQL Docker
  npm run test:browser:docker # Chạy 14 test E2E trình duyệt trên Playwright + Docker
  npm run test:prototype      # Chạy 16 test kiểm tra đối chiếu mẫu giao diện tĩnh
  ```

* **Quản trị Cơ sở dữ liệu**:
  ```bash
  npm run db:up        # Khởi động cụm PostgreSQL nền
  npm run db:stop      # Dừng cụm PostgreSQL
  npm run db:status    # Kiểm tra trạng thái container và kết nối DB
  npm run db:backup    # Xuất bản sao lưu DB nguyên tử (single-transaction)
  npm run db:restore   # Phục hồi dữ liệu từ bản sao lưu
  ```

---

## 9. Quy ước lập trình & Patterns cốt lõi

1. **Phân tách tầng trách nhiệm nghiêm ngặt (D01)**:
   - `Route` gắn đường dẫn HTTP và middleware.
   - `Controller` chỉ bóc tách DTO, validate và trả về HTTP response.
   - `Service` kiểm tra nghiệp vụ và mở `repository.transaction(async (tx) => { ... })`.
   - `Repository` chỉ chứa câu lệnh SQL/Prisma, bắt buộc dùng context `tx` được truyền vào.
2. **Xử lý lỗi tập trung bằng `DomainError`**:
   - Định nghĩa tại `backend/src/types/errors.ts`.
   - Mã lỗi là hằng số chuỗi (`INSUFFICIENT_STOCK`, `CART_LOCKED`, `PRICE_CHANGED`, `KEY_REUSED`, `AUTH_REQUIRED`, v.v.).
   - `backend/src/middlewares/errors.ts` chuyển đổi tự động mã lỗi sang HTTP status code tương ứng (400, 401, 403, 404, 409, 422).
3. **Cơ chế Idempotency chống lặp lệnh**:
   - Khách thêm hàng: Dùng `idempotencyKey` + `digest` (băm SHA-256 từ `productId + quantity + version`) lưu vào `CartOperation`.
   - Thanh toán: Dùng `PaymentInput.key` + `digest` lưu vào `Payment`.
   - Webhook: Dùng `eventId` + `digest` lưu vào `PaymentEvent`.
4. **Bảo vệ toàn vẹn dữ liệu lúc mua hàng**:
   - Mọi thao tác đổi giỏ hoặc thanh toán đều đi kèm `version` (Optimistic Concurrency Control).
   - Khi thanh toán, giỏ hàng chụp snapshot danh sách sản phẩm và giá; nếu giá tại quầy bị đổi giữa chừng thì hệ thống từ chối thanh toán và báo `PRICE_CHANGED`.
5. **Bảo mật mật khẩu**:
   - Thuật toán `scrypt` với muối ngẫu nhiên 16 bytes, khóa 64 bytes (`backend/src/utils/security.ts:25-35`).
   - Tuyệt đối không hardcode mật khẩu trong source code (tuân thủ nguyên tắc AGENTS.md).

---

## 10. Chiến lược Kiểm thử (Testing)

Dự án sở hữu 3 tầng kiểm thử tự động độc lập với độ tin cậy cao:

1. **Kiểm thử tích hợp Backend (`backend/tests/checkout.test.ts` - 24 ca test)**:
   - Sử dụng `Supertest` gọi trực tiếp vào API thật kết nối với PostgreSQL thật.
   - Bao phủ các kịch bản hóc búa nhất:
     - 2 khách hàng cùng đặt mua sản phẩm cuối cùng đồng thời (Race condition): Đảm bảo chỉ duy nhất 1 khách thành công, khách kia nhận 409.
     - Giỏ hàng nhiều món nhưng 1 món hết hàng: Rollback toàn bộ các lượt giữ hàng trước đó.
     - Webhook gửi trùng lặp (Duplicate Webhook): Không bao giờ tạo 2 đơn hàng hoặc trừ kho 2 lần.
     - Hủy thanh toán hoặc thanh toán thất bại: Tự động hoàn trả tồn kho `reserved`.
     - Phân quyền RBAC, kiểm tra CSRF token, Session expiry.
     - Sao lưu và phục hồi DB (`backup.ts` / `restoreToFreshDatabase`) kiểm chứng dữ liệu nguyên vẹn.
2. **Kiểm thử E2E Trình duyệt (`tests/app.browser.cjs` - 14 ca test)**:
   - Sử dụng `Playwright` điều khiển trình duyệt Chromium thực tế.
   - Mô phỏng toàn bộ hành vi người dùng: Quét mã camera, xác nhận modal xóa giỏ, hiển thị QR, bấm F5 reload phục hồi hóa đơn, Staff giám sát, Admin tạo/sửa sản phẩm.
   - Tích hợp `@axe-core/playwright` quét vi phạm tiêu chuẩn tiếp cận WCAG (độ tương phản màu, phím Tab, nhãn aria-label).
3. **Kiểm thử giao diện mẫu (`docs/tests/prototype.browser.cjs` - 16 ca test)**:
   - Đối chiếu tính năng thực tế với bản thiết kế prototype ban đầu.

---

---

## 12. Rủi ro & Nợ kỹ thuật (Technical Debt)

Dựa trên phân tích mã nguồn thực tế và rà soát tại [docs/report.md](docs/report.md#L94-L144):

1. **Chưa có TTL tự động giải phóng hàng giữ (Reservation Timeout)**:
   - *Vị trí*: `backend/src/services/checkout.service.ts → prepare()`.
   - *Rủi ro*: Nếu khách bấm "Thanh toán" (hàng bị giữ trong DB: `reserved > 0`) nhưng sau đó khách bỏ về, hàng sẽ bị giữ vô thời hạn cho đến khi có sự kiện `failure` từ Gateway. Cần bổ sung background cron job định kỳ quét các bản ghi `Reservation` ở trạng thái `held` quá 10–15 phút để tự động release.
2. **Tạo sản phẩm mới mặc định tồn kho `onHand = 0` (Out of Scope)**:
   - *Vị trí*: `backend/src/repositories/application.repository.ts:96`.
   - *Thực tế*: Không có form nhập kho trên UI (theo quyết định D09, phân hệ Nhập kho nằm ngoài phạm vi đồ án). Kỹ sư can thiệp cần biết: muốn sản phẩm mới có hàng để test mua, phải sửa trực tiếp trong database hoặc seed.
3. **Endpoint mô phỏng thanh toán chưa khóa môi trường Production**:
   - *Vị trí*: `backend/src/routes/api.routes.ts:33` (`POST /payments/:id/simulate`).
   - *Rủi ro*: Endpoint này dùng cho việc demo/test kết quả thanh toán. Khi triển khai production thật, cần có middleware chặn không cho phép gọi nếu `NODE_ENV === "production"`.
4. **Chưa có worker dọn dẹp giỏ hàng mồ côi (Orphan Carts)**:
   - *Thực tế*: Khách hàng vô danh tạo giỏ rồi bỏ đi, sau 8 giờ cookie hết hạn nhưng bản ghi `Cart` vẫn tồn tại mãi trong database. Lâu dài cần script dọn dẹp giỏ rác sau 48h.
5. **Cấu hình Trust Proxy cố định Loopback**:
   - *Vị trí*: `backend/src/app.ts:35` (`app.set("trust proxy", "loopback")`). Cần chuyển thành biến môi trường khi triển khai sau Nginx/Cloudflare.

---

## 13. Hướng dẫn can thiệp mã nguồn an toàn

Dành cho kỹ sư muốn sửa lỗi hoặc phát triển tính năng mới:

### Quy tắc bắt buộc trước khi can thiệp (Theo AGENTS.md)
1. **Tuyệt đối không commit hoặc push trực tiếp vào `main`**: Luôn làm việc trên nhánh tính năng hoặc bugfix (`feat/...`, `fix/...`).
2. **Quy tắc đẩy code lên GitHub**: Việc commit và push do người dùng tự thực thi, agent AI không tự ý chạy lệnh ghi vào git remote.
3. **Không hardcode secrets**: Không đặt mật khẩu, API key, JWT secret vào file mã nguồn. Mọi cấu hình phải lấy từ biến môi trường (`process.env`).

### Điểm chạm mã nguồn theo từng bài toán:
* **Thêm / Sửa endpoint API Backend**:
  1. Khai báo schema DTO tại `backend/src/validators/`.
  2. Thêm route và gắn middleware tại `backend/src/routes/api.routes.ts`.
  3. Thêm hàm nhận DTO tại `backend/src/controllers/api.controller.ts`.
  4. Viết logic nghiệp vụ tại `backend/src/services/checkout.service.ts` hoặc `application.service.ts`.
  5. Viết câu truy vấn Prisma tại `backend/src/repositories/`.
  6. Luôn bọc logic thay đổi dữ liệu trong `this.repository.transaction()`.
* **Thêm màn hình / Sửa giao diện Frontend**:
  1. Thêm định nghĩa route tại `frontend/src/routing.ts` (kiểu `Page`, bảng `paths`, hàm `readRoute`).
  2. Viết component tại `frontend/src/pages/`.
  3. Thêm hàm gọi API tương ứng tại `frontend/src/api.ts` (nhớ truyền `csrf` header cho request POST/PATCH/DELETE).
  4. Khai báo component vào `App()` trong `frontend/src/main.tsx`.
* **Sửa đổi Cấu trúc Dữ liệu Database**:
  1. Chỉnh sửa `prisma/schema.prisma`.
  2. Chạy `npm run db:generate` để cập nhật Prisma Client.
  3. Tạo migration mới qua Prisma hoặc cập nhật `prisma/migrations/`.

### Lệnh kiểm tra xác nhận an toàn trước khi bàn giao:
```bash
npm run lint          # Phải đạt 0 error, 0 warning
npm run format:check  # Định dạng phải khớp 100% Prettier
npm run build         # Phải build thành công cả Backend TS, Tools TS và Frontend Vite
npm run test:docker   # (Nếu có Docker) 24/24 integration test phải PASS
```

---

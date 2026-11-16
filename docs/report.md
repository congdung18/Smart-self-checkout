# BÁO CÁO TỔNG HỢP: NHỮNG TÍNH NĂNG ĐÃ LÀM ĐƯỢC VÀ NHỮNG VIỆC CHƯA LÀM ĐƯỢC

> **Dự án**: Smart Self-Checkout (Hệ thống Quầy thanh toán tự phục vụ)  
> **Môn học**: Nhập môn Công nghệ Phần mềm — Nhóm 13 (VNU-HCMUS)  
> **Thời điểm lập báo cáo**: 16/11/2026  
> **Trạng thái tổng thể**: Đã hoàn thành 100% các tính năng nghiệp vụ cốt lõi (Must-have, Should-have, Could-have) theo kế hoạch đồ án, sẵn sàng chạy demo hoàn chỉnh trên môi trường local.

---

## PHẦN I: NHỮNG TÍNH NĂNG ĐÃ LÀM ĐƯỢC VÀ CÁCH THỰC HIỆN

### 1. Kiến trúc tổng thể và Bộ công cụ khởi chạy (Architecture & Tooling)

* **Cách thực hiện**:
  * **Mô hình kiến trúc phân tầng (Layered Architecture)**: Phân chia mã nguồn rõ ràng theo quyết định kỹ thuật D01:
    * `backend/src/routes/`: Khai báo endpoint URL.
    * `backend/src/controllers/`: Nhận request HTTP, validate dữ liệu đầu vào.
    * `backend/src/services/`: Xử lý nghiệp vụ logic cốt lõi.
    * `backend/src/repositories/`: Truy vấn SQL và tương tác database qua Prisma ORM.
    * `backend/src/middlewares/`: Kiểm soát bảo mật, session, chống CSRF, phân quyền RBAC.
  * **Khởi chạy toàn bộ hệ thống (Demo Local)**:
    * Được điều phối bởi nhạc trưởng [`tools/local.ts`](../tools/local.ts).
    * **Chạy với Docker (`npm run dev`)**: Yêu cầu Docker Desktop đang bật, tự động khởi động PostgreSQL 18.6 qua Docker Compose ([`compose.yaml`](../compose.yaml)) trên cổng `55433`.
    * **Chạy KHÔNG cần Docker (`npm run dev:native`)**: Dùng bộ nhị phân PostgreSQL portable nhúng sẵn trong `node_modules`, khởi động trên cổng `55432`, hoàn toàn không phụ thuộc vào Docker Desktop.
    * Tự động chạy Prisma migrations và nạp dữ liệu mẫu ban đầu ([`backend/src/seed.ts`](../backend/src/seed.ts)).
    * Khởi động đồng thời 3 dịch vụ: Backend API (`:3000`), Mock Payment Gateway (`:3001`) và Frontend Vite (`:5173`).
    * **Tài khoản thử nghiệm có sẵn**: Admin (`admin` / `Admin@12345678`), Staff (`staff` / `Staff@12345678`).
    * Gõ `stop` trong terminal sẽ đóng gọn gàng toàn bộ tiến trình, bảo toàn dữ liệu trong volume.
  * **Công cụ quản trị dữ liệu**: Có sẵn các script backup, restore nguyên tử (single transaction), đối soát catalog và kiểm tra tính toàn vẹn của 15 bảng dữ liệu trong [`tools/`](../tools).

---

### 2. Luồng Khách hàng tự phục vụ (Customer Checkout Flow)

| Tính năng | Đã làm được gì? | Triển khai như thế nào? (File & Dòng) |
| :--- | :--- | :--- |
| **Quét mã vạch (Barcode Scanner)** | Tích hợp camera trực tiếp quét mã vạch qua webcam máy tính hoặc camera điện thoại. Có chế độ tự động bật/tắt luồng camera để tiết kiệm pin. Có ô nhập mã tay dự phòng khi thiết bị không có camera hoặc bị từ chối cấp quyền. | Component [`frontend/src/Scanner.tsx`](../frontend/src/Scanner.tsx). Sử dụng thư viện chuẩn xử lý MediaStream, tự động bắt sự kiện `onScan` khi tìm thấy barcode hợp lệ. |
| **Xem trước sản phẩm (Product Preview)** | Khi quét hoặc nhập mã vạch thành công, hệ thống hiện thông tin sản phẩm (Tên, Hình ảnh, Giá bán, Tồn kho) để khách chủ động bấm "Thêm vào giỏ", không tự ý thêm ngầm. | Endpoint `GET /v1/products/barcode/:code` tại [`backend/src/routes/api.routes.ts`](../backend/src/routes/api.routes.ts). Xử lý tại `Customer.tsx:320-350`. |
| **Quản lý giỏ hàng (Cart Management)** | Khách hàng vô danh (không cần đăng nhập) được cấp một session giỏ hàng an toàn qua cookie. Cho phép tăng/giảm số lượng từng món, xóa từng món, hoặc xóa toàn bộ giỏ kèm hộp thoại modal xác nhận chống bấm nhầm. | Quản lý state giỏ hàng tại [`frontend/src/pages/Customer.tsx`](../frontend/src/pages/Customer.tsx), gọi các API `POST /v1/carts/:id/items`, `PATCH /v1/carts/:id/items/:itemId`, `DELETE /v1/carts/:id/items/:itemId`. |
| **Đóng băng giỏ & Giữ hàng tồn kho (Inventory Reservation)** | Khi khách bấm "Tiến hành thanh toán", giỏ hàng bị khóa cứng (`status = "checkout"`) không cho sửa. Hệ thống tạo bản ghi giữ hàng (`InventoryReservation`) để bảo toàn số lượng tồn thực tế trong kho. Giá tiền tại thời điểm bấm thanh toán được chốt cố định trong snapshot. | Xử lý trong transaction tại [`backend/src/services/checkout.service.ts:160-210`](../backend/src/services/checkout.service.ts) và [`backend/src/repositories/checkout.repository.ts:65-85`](../backend/src/repositories/checkout.repository.ts). |
| **Chống tranh chấp tồn kho đồng thời (Concurrency Lock)** | Giải quyết triệt để tình huống 2 khách hàng cùng quét mua món hàng cuối cùng (`onHand = 1`). Chỉ đúng 1 người đặt trước thành công; người thứ hai nhận mã lỗi 409 `INSUFFICIENT_STOCK` và thông báo hết hàng thân thiện, tuyệt đối không bao giờ bị bán âm kho (overselling). | Sử dụng câu lệnh SQL nguyên tử trực tiếp trên PostgreSQL: <br>`UPDATE "Stock" SET reserved = reserved + $qty WHERE "productId" = $id AND ("onHand" - reserved) >= $qty`. |
| **Thanh toán QR mô phỏng (Mock Payment QR)** | Sinh mã QR thanh toán động. Sử dụng cổng thanh toán riêng biệt mô phỏng đầy đủ 4 trạng thái: Thành công, Thất bại, Chờ xử lý (Pending), Quá hạn (Timeout). Chống thanh toán lặp bằng cơ chế khóa duy nhất `idempotencyKey`. | Cổng giả lập chạy tại [`backend/src/gateway-server.ts`](../backend/src/gateway-server.ts). Callback gửi về backend được bảo vệ bằng chữ ký HMAC SHA-256 (`x-signature`). |
| **Xuất kho & Hóa đơn chi tiết (Receipt)** | Khi thanh toán thành công, hệ thống chính thức trừ tồn kho thực tế (`onHand = onHand - qty, reserved = reserved - qty`), tạo bản ghi `Order` và xuất hóa đơn chi tiết ngay trên màn hình. Nếu thanh toán thất bại, số lượng giữ hàng tự động hoàn trả về kho. | Nghiệp vụ `completeCheckout` trong [`backend/src/services/checkout.service.ts:240-310`](../backend/src/services/checkout.service.ts). |
| **Khôi phục hóa đơn sau reload (PA-01)** | Nếu khách vô tình bấm F5 tải lại trang sau khi thanh toán, hóa đơn vừa mua vẫn được khôi phục nguyên vẹn từ `sessionStorage`, không bị mất màn hình cho đến khi khách chủ động bấm "Bắt đầu lượt mua mới". | Lưu trữ an toàn mã đơn hàng vừa hoàn tất tại `sessionStorage` phía client và phục hồi qua `GET /v1/carts/:id/current` ([`frontend/src/pages/Customer.tsx:85-110`](../frontend/src/pages/Customer.tsx)). |

---

### 3. Luồng Quản trị & Nhân viên (Staff / Admin Flow)

* **Thông tin tài khoản đăng nhập thử nghiệm (Test Accounts & Credentials)**:
  * **Trang đăng nhập**: [http://127.0.0.1:5173/#/login](http://127.0.0.1:5173/#/login) (hoặc bấm nút "Đăng nhập" ở góc trên thanh điều hướng).
  * **Danh sách tài khoản đã nạp sẵn trong hệ thống**:
    | Vai trò (Role) | Tên đăng nhập (Username) | Mật khẩu (Password) | Quyền hạn và Phạm vi truy cập |
    | :--- | :--- | :--- | :--- |
    | **Quản trị viên (Admin)** | `admin` | `Admin@12345678` | **Toàn quyền**: Quản lý kho hàng, tạo/sửa sản phẩm, bật/ngừng kinh doanh, xem Báo cáo doanh thu & danh sách đơn hàng (`/reports`), Giám sát giỏ hàng (`/monitoring/carts`). |
    | **Nhân viên quầy (Staff)** | `staff` | `Staff@12345678` | **Giới hạn**: Giám sát giỏ hàng các quầy thời gian thực (`/monitoring/carts`), tra cứu sản phẩm (`/v1/lookup`). Bị chặn truy cập (HTTP 403 Forbidden) vào Báo cáo doanh thu và Chỉnh sửa sản phẩm. |
  * **Cơ chế lưu trữ & Bảo mật**:
    * Mật khẩu dạng chữ rõ phục vụ phát triển/kiểm thử được lưu cục bộ tại [.runtime/app.json](../.runtime/app.json) (được bảo vệ bởi `.gitignore`, không bao giờ bị đưa lên Git).
    * Trong cơ sở dữ liệu PostgreSQL (bảng `"User"`), mật khẩu được băm một chiều an toàn bằng thuật toán `scrypt` với muối ngẫu nhiên (salt 16-byte) và chuỗi băm 64-byte thông qua hàm `seed()` ([`backend/src/seed.ts`](../backend/src/seed.ts)).

| Tính năng | Đã làm được gì? | Triển khai như thế nào? (File & Dòng) |
| :--- | :--- | :--- |
| **Xác thực & Phân quyền (Auth & RBAC)** | Đăng nhập tài khoản Staff / Admin bằng cơ chế session cookie máy chủ (`HttpOnly`, `SameSite=Lax`). Mật khẩu được băm an toàn bằng thuật toán `scrypt`. Có middleware chống CSRF trên toàn bộ các request thay đổi dữ liệu và rate limiting (300 req/phút) chống dò mật khẩu. | Middleware [`backend/src/middlewares/auth.ts`](../backend/src/middlewares/auth.ts), [`backend/src/middlewares/security.ts`](../backend/src/middlewares/security.ts), [`backend/src/security.ts`](../backend/src/security.ts). |
| **Bảng giám sát giỏ hàng tại quầy (Monitor Dashboard)** | Nhân viên theo dõi thời gian thực các quầy đang có giỏ hàng hoạt động, xem chi tiết từng món hàng khách đang chọn, thời điểm cập nhật gần nhất (`asOf`), nút làm mới thủ công (Refresh), và tự động chụp snapshot giỏ hàng khi khách đang thanh toán. | Tab Monitor tại [`frontend/src/pages/Admin.tsx:120-195`](../frontend/src/pages/Admin.tsx), gọi API `GET /v1/admin/monitoring`. Phân quyền cho cả `Staff` và `Admin`. |
| **Quản lý danh mục & Tồn kho (Inventory Management)** | Xem bảng danh mục sản phẩm, hiển thị số lượng tồn kho và nhãn trạng thái (Còn hàng / Hết hàng). Hỗ trợ tìm kiếm tức thời theo Tên, SKU hoặc Mã vạch (kể cả mã có số 0 ở đầu). Hỗ trợ tạo sản phẩm mới, cập nhật sản phẩm, và kích hoạt/ngừng bán sản phẩm (kèm modal xác nhận). | Tab Inventory tại [`frontend/src/pages/Admin.tsx:210-340`](../frontend/src/pages/Admin.tsx), gọi API `GET /v1/admin/products`, `POST /v1/admin/products`, `PATCH /v1/admin/products/:id`. |
| **Báo cáo doanh thu & Đơn hàng (Revenue Reports)** | Thống kê tổng doanh thu theo khoảng thời gian tùy chọn (xử lý chính xác bao gồm cả ngày kết thúc theo múi giờ Việt Nam UTC+7). Phân loại doanh thu theo 4 trạng thái thanh toán. Hiển thị danh sách các đơn hàng hoàn tất kèm phân trang. | Tab Reports tại [`frontend/src/pages/Admin.tsx:360-450`](../frontend/src/pages/Admin.tsx), gọi API `GET /v1/admin/reports`. Chỉ cấp quyền truy cập cho tài khoản `Admin`. |

---

### 4. Giao diện Người dùng & Tiêu chuẩn Trợ năng (UX & Accessibility)

* **Thiết kế thích ứng đa kích thước (Responsive Layout)**:
  * Tối ưu hiển thị hoàn hảo trên 3 chuẩn màn hình: Điện thoại (360px), Máy tính bảng (768px), Màn hình quầy cảm ứng lớn (1280px).
  * Viết thuần CSS tối ưu trong [`frontend/src/style.css`](../frontend/src/style.css).
* **Tiêu chuẩn tiếp cận người dùng (WCAG Accessibility Compliance)**:
  * Hỗ trợ điều hướng hoàn toàn bằng bàn phím (phím `Tab` duyệt qua các nút, phím `Esc` đóng popup và tự động hoàn trả tiêu điểm bàn phím về nút kích hoạt ban đầu).
  * Hỗ trợ chế độ phóng to chữ 200% mà không bị vỡ giao diện.
  * Hỗ trợ chế độ giảm chuyển động (`prefers-reduced-motion`).
  * Có nhãn ARIA hỗ trợ các phần mềm đọc màn hình cho người khiếm thị.
* **Xử lý phản hồi lỗi biểu mẫu (PA-07)**:
  * Lỗi kiểm tra dữ liệu hiển thị trực quan ngay tại từng ô nhập liệu (inline error).
  * Giữ nguyên dữ liệu người dùng đã điền (draft state) khi gặp lỗi thay vì xóa trắng form.

---

### 5. Bộ kiểm thử tự động toàn diện (Test Suites)

* **`npm run test:prototype` (16/16 ca PASS)**: Kiểm thử tự động trên trình duyệt Playwright đối chiếu 100% các màn hình và trạng thái của bản mẫu thiết kế, kiểm tra WCAG, responsive.
* **`npm run test:docker` (24/24 ca PASS khi có Docker)**: Kiểm thử tích hợp toàn diện backend trên PostgreSQL Docker cô lập: ACID transaction, race condition mua hàng đồng thời, khóa giữ hàng, rollback khi lỗi, khôi phục database.
* **`npm run test:browser:docker` (14/14 ca PASS khi có Docker)**: Kiểm thử E2E tương tác thực tế giữa trình duyệt và backend.

---

## PHẦN II: NHỮNG VIỆC CHƯA LÀM ĐƯỢC / KHOẢNG TRỐNG / NGOÀI PHẠM VI

Dưới đây là danh sách trung thực và chi tiết những hạn chế, khoảng trống kỹ thuật hiện tại của dự án cùng lý do:

### 1. Về luồng Giữ hàng & Thanh toán (Reservation & Payment Gaps)

1. **Chưa có thời gian sống (TTL) tự hủy cho bản ghi giữ hàng (Reservation Timeout)**:
   * *Hiện trạng*: Khi khách hàng bấm "Thanh toán" (hàng bị giữ trong DB) nhưng khách bỏ đi, tắt trình duyệt hoặc mất kết nối vĩnh viễn mà không hoàn tất thanh toán.
   * *Hạn chế*: Số lượng hàng bị giữ (`reserved`) vẫn nằm trong database và giỏ hàng vẫn ở trạng thái khóa `checkout`. Hiện chưa có một tiến trình chạy ngầm (cron job / background timer) để tự động quét và hủy các lượt giữ hàng quá thời gian chờ (ví dụ sau 10–15 phút) để hoàn trả hàng về kệ cho khách khác mua.
2. **Thiếu nút "Hủy thanh toán / Quay lại sửa giỏ" trên giao diện**:
   * *Hiện trạng*: Khi đang ở màn hình hiển thị mã QR thanh toán, trên giao diện chưa có nút bấm rõ ràng cho phép khách hàng chủ động hủy phiên thanh toán để quay lại thêm/bớt món trong giỏ hàng. Khách phải đóng trang hoặc chờ cổng thanh toán báo kết quả.
3. **Chưa có cơ chế Auto-polling cho giao dịch Pending**:
   * *Hiện trạng*: Khi giao dịch rơi vào trạng thái `PENDING` (chờ người dùng mở app ngân hàng quét mã), frontend chưa tự động gọi API định kỳ (`setInterval` sau mỗi 3-5 giây) để kiểm tra xem tiền đã vào hay chưa; hiện tại khách vẫn cần bấm nút kiểm tra trạng thái trên modal.

---

### 2. Về quản lý tồn kho (Inventory & Warehouse Gaps)

1. **Tạo sản phẩm mới mặc định tồn kho `onHand = 0` (Không có form nhập kho)**:
   * *Hiện trạng*: Khi tài khoản Admin tạo một sản phẩm mới qua giao diện quản trị, sản phẩm đó tự động được gán số lượng tồn kho `onHand = 0` ([`backend/src/repositories/application.repository.ts:96`](../backend/src/repositories/application.repository.ts)). Do đó, khách hàng quét mã sản phẩm này sẽ bị báo "Hết hàng" ngay lập tức và không mua được.
   * *Nguyên nhân*: Đây là **khác biệt có chủ ý theo phạm vi đồ án** (đã được ghi rõ trong Quyết định kiến trúc **D09** và kế hoạch triển khai: phân hệ Quản lý kho, Nhập hàng, Kiểm kê hàng hóa nằm ngoài phạm vi của đồ án quầy thanh toán tự phục vụ).
   * *Cách khắc phục hiện tại*: Muốn bổ sung số lượng tồn kho cho sản phẩm mới, nhân viên phải nạp qua script seed hoặc câu lệnh SQL trực tiếp vào database.

---

### 3. Về phiên làm việc & Trải nghiệm (Session & UX Gaps)

1. **Form thêm/sửa sản phẩm chưa lưu tạm vào `sessionStorage` khi hết hạn phiên**:
   * *Hiện trạng*: Khi Admin đang gõ dở thông tin mô tả sản phẩm mà phiên đăng nhập bị hết hạn (nhận mã lỗi 401 `AUTH_REQUIRED`). Giao diện hiện thông báo yêu cầu đăng nhập lại.
   * *Hạn chế*: Nếu Admin bấm chuyển sang trang `#/login`, component form bị unmount và toàn bộ nội dung vừa gõ dở trong React state sẽ bị mất do chưa được lưu đệm vào `sessionStorage`. Sau khi đăng nhập lại, Admin phải gõ lại thông tin từ đầu.
2. **Chưa có worker dọn dẹp các giỏ hàng mồ côi (Orphan Carts)**:
   * *Hiện trạng*: Khách hàng thêm sản phẩm vào giỏ rồi bỏ về không mua. Sau 8 tiếng, session cookie của khách hết hạn.
   * *Hạn chế*: Bản ghi giỏ hàng đó vẫn lưu trong bảng `Cart` ở trạng thái `active`. Lâu dài cần có một cron job dọn dẹp các giỏ hàng không còn chủ sở hữu sau một khoảng thời gian quy định (ví dụ 24–48 giờ).

---

### 4. Về hạ tầng triển khai thực tế (Production Readiness Gaps)

1. **Môi trường chạy thực tế (Production Hosting & HTTPS)**:
   * *Hiện trạng*: Hệ thống hiện tối ưu chạy trên môi trường Local Development (máy cục bộ với giao thức `http://localhost`).
   * *Hạn chế*: Chưa triển khai lên cloud server thực tế. Trên các thiết bị điện thoại thông minh thực tế, tính năng quét mã vạch qua webcam yêu cầu trình duyệt phải chạy trên kết nối bảo mật `https://` (hoặc localhost) thì mới cho phép mở camera.
2. **Cổng thanh toán thực tế**:
   * *Hiện trạng*: Đang tích hợp Cổng thanh toán giả lập nội bộ (`Mock Payment Gateway`).
   * *Hạn chế*: Chưa tích hợp với các cổng thanh toán ngân hàng thật ngoài đời (VietQR, VNPay, MoMo, ZaloPay production).
3. **Kiểm tra môi trường cho Endpoint Simulate**:
   * *Hiện trạng*: Endpoint `POST /v1/payments/:id/simulate` (dùng để bấm nút mô phỏng thành công/thất bại khi demo) hiện chưa có middleware kiểm tra chặn nếu ứng dụng chạy ở môi trường `NODE_ENV=production`.
4. **Cấu hình Reverse Proxy**:
   * *Hiện trạng*: Cấu hình `app.set("trust proxy", ...)` trong Express đang fix cứng cho IP loopback `127.0.0.1`, cần đưa ra biến môi trường cấu hình linh hoạt khi đặt sau các reverse proxy thực tế như Nginx hay Cloudflare.

---

## PHẦN III: BẢNG TỔNG KẾT ĐÁNH GIÁ CHUNG

| Tiêu chí đánh giá | Trạng thái hiện tại | Mức độ hoàn thiện |
| :--- | :---: | :---: |
| **Chức năng nghiệp vụ cốt lõi (M01–M08)** | Đã xong và kiểm chứng 100% | **100%** |
| **Chức năng nên có (S01–S02)** | Đã xong và kiểm chứng 100% | **100%** |
| **Chức năng có thể có (C01)** | Đã xong và kiểm chứng 100% | **100%** |
| **Lệch mẫu thiết kế (PA-01–PA-11)** | Đã xử lý toàn bộ | **100%** |
| **Độ ổn định khi Demo Local (`npm run dev` / `npm run dev:native`)** | Mượt mà, đầy đủ dữ liệu mẫu | **Xuất sắc** |
| **Vận hành Production thật (Thanh toán thật, Cloud, HTTPS)** | | **Backlog tương lai** |

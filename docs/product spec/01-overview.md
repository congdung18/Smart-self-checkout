# 01 - Tổng quan sản phẩm, Tầm nhìn & Phạm vi MVP

Trạng thái: ACTIVE | Chủ sở hữu: PO | Ngày: 2026-11-16 | Liên quan D: D01–D12

Tài liệu này cung cấp bức tranh tổng quan về hệ thống **Smart Self-Checkout**, bài toán kinh doanh, tầm nhìn sản phẩm, phạm vi các mốc tính năng (MVP) và kế hoạch quản lý sản phẩm.

---

## Danh mục tài liệu Đặc tả sản phẩm (Product Specification)

Thư mục `product spec` bao gồm đầy đủ các tài liệu đặc tả kỹ thuật và nghiệp vụ:

* **[01 - Tổng quan sản phẩm, Tầm nhìn & Phạm vi MVP](01-overview.md)** (Tài liệu này)
* **[02 - Đặc tả yêu cầu và nghiệp vụ](02-requirements.md)**: Danh mục yêu cầu chức năng (FR-01 đến FR-14), phi chức năng (NFR) và tiêu chuẩn WCAG.
* **[03 - Đặc tả kỹ thuật REST API](03-api.md)**: Hợp đồng giao tiếp API, cấu trúc request/response DTO và mã lỗi.
* **[03 - Thiết kế mô hình dữ liệu](03-data.md)**: Lược đồ dữ liệu quan hệ PostgreSQL, 15 thực thể Prisma và ràng buộc toàn vẹn.
* **[03 - Đặc tả kiến trúc công nghệ](03-tech.md)**: Quyết định kiến trúc phân tầng, công nghệ Express, React, Vite, Prisma.
* **[03 - Đặc tả giao diện người dùng & UX](03-ui.md)**: Luồng màn hình khách hàng và quản trị, thiết kế thích ứng (responsive).

---

## 1. Tầm nhìn sản phẩm (Product Vision)

Smart Self-Checkout hỗ trợ khách hàng tự tra cứu, quét hoặc nhập mã vạch sản phẩm, kiểm tra giỏ hàng và thanh toán không dùng tiền mặt (QR động) ngay trên trình duyệt mà không cần cài đặt ứng dụng. Nhân viên quầy theo dõi phiên giỏ hàng thời gian thực để kịp thời hỗ trợ; Quản trị viên quản lý danh mục, kiểm soát tồn kho và theo dõi báo cáo doanh thu.

Thành công của MVP là hoàn thành trọn vẹn một lượt mua hàng:
1. Dễ hiểu, minh bạch giá và số lượng.
2. Tuyệt đối không bán vượt tồn kho (overselling) khi có tranh chấp đồng thời giữa nhiều quầy.
3. Xuất hóa đơn đúng một lần khi backend xác nhận thanh toán thành công, kể cả khi mạng gặp sự cố hoặc webhook gửi lặp.

| Nhóm tác nhân | Nhu cầu chính | Bối cảnh sử dụng |
| :--- | :--- | :--- |
| **Khách hàng (Customer)** | Quét mã nhanh, xem preview sản phẩm, chỉnh sửa giỏ, thanh toán QR an toàn, khôi phục hóa đơn sau reload. | Thiết bị di động cá nhân hoặc Kiosk tự phục vụ tại cửa hàng. |
| **Nhân viên (Staff)** | Giám sát trạng thái các quầy theo thời gian thực, xem chi tiết giỏ hàng đang thanh toán để hỗ trợ. | Màn hình giám sát chuyên dụng (chỉ đọc). |
| **Quản trị viên (Admin)** | Quản lý danh mục sản phẩm, theo dõi số lượng tồn kho khả dụng, xem thống kê báo cáo doanh thu. | Giao diện quản trị web có xác thực bảo mật. |

---

## 2. Kế hoạch xác thực ý tưởng & Rủi ro ưu tiên

* **Giả định rủi ro cao nhất**: Khách hàng hiểu rõ trạng thái "chờ thanh toán / chưa xác nhận" và không cố thanh toán lặp lần hai khi mạng bị trễ.
* **Biện pháp kỹ thuật giải quyết**:
  - Khóa cứng giỏ hàng khi bước vào thanh toán (`lockCart`).
  - Sử dụng cơ chế khóa phân tán / Optimistic Concurrency Control qua `version` và `idempotencyKey`.
  - Sinh mã thanh toán QR động gắn liền với snapshot giỏ hàng cố định giá tiền tại thời điểm bấm thanh toán.

---

## 3. Phạm vi tính năng (Scope Definition)

| Phân loại | Mã yêu cầu nguồn | Mô tả phạm vi | Trạng thái triển khai |
| :--- | :--- | :--- | :---: |
| **Must-have** | FR-01, FR-02, FR-03, FR-04, FR-05, FR-06, FR-08, FR-09, FR-10, FR-11; NFR-01–04 | Quét barcode, xem preview, sửa giỏ, giữ tồn kho nguyên tử, thanh toán QR, xuất hóa đơn, quản lý danh mục Admin. | **Đã hoàn thành 100%** |
| **Should-have** | FR-07, FR-12, FR-14; NFR-05–08 | Hủy giỏ có xác nhận, xem bảng tồn kho, màn hình giám sát giỏ hàng cho Staff. | **Đã hoàn thành 100%** |
| **Could-have** | FR-13 | Báo cáo thống kê doanh thu theo thời gian dành cho Admin. | **Đã hoàn thành 100%** |
| **Out-of-Scope** | - | Tiền mặt, kết nối ngân hàng thật ngoài đời, nhập kho/kiểm kê kho nâng cao, tích điểm thành viên (Loyalty). | Không thuộc phạm vi đồ án |

---

## 4. Backlog User Stories (US01 – US12)

| Story ID | Tóm tắt tính năng | Mức ưu tiên | Thành phần phụ trách |
| :--- | :--- | :---: | :--- |
| **US01** | Tra cứu sản phẩm theo mã vạch / SKU, hiển thị xem trước không ghi ngầm. | Must | Backend API, Frontend |
| **US02** | Nhập mã tay, thêm sản phẩm vào giỏ và tự động lưu phiên giỏ hàng. | Must | Backend API, Frontend |
| **US03** | Quét mã vạch trực tiếp qua camera máy tính/điện thoại, có cơ chế nhập tay dự phòng. | Must | Frontend Scanner |
| **US04** | Tăng/giảm số lượng từng món, xóa từng món, tự động tính tổng tiền phía server. | Must | Backend, Frontend |
| **US05** | Xóa toàn bộ giỏ hàng kèm modal xác nhận chống bấm nhầm. | Should | Frontend Component |
| **US06** | Khóa giỏ hàng, đặt giữ tồn kho nguyên tử (`reserved`), sinh mã QR thanh toán. | Must | Backend Service, Gateway |
| **US07** | Xử lý đầy đủ 4 trạng thái thanh toán (Pending, Success, Failure, Timeout). | Must | Gateway, Backend Service |
| **US08** | Hoàn tất đơn hàng nguyên tử khi nhận Webhook, trừ kho thật, lưu snapshot hóa đơn. | Must | Backend Transaction |
| **US09** | Đăng nhập bảo mật tài khoản Quản trị viên (Admin) để tạo và sửa sản phẩm. | Must | Backend Auth, Admin Page |
| **US10** | Quản trị viên tra cứu danh mục và xem mức tồn kho thực tế / trạng thái kinh doanh. | Should | Admin Inventory |
| **US11** | Đăng nhập tài khoản Nhân viên (Staff) để giám sát các quầy giỏ hàng theo thời gian thực. | Should | Staff Monitor Page |
| **US12** | Quản trị viên xem báo cáo doanh thu theo khoảng ngày và lọc theo trạng thái đơn hàng. | Could | Admin Reports Page |

---

## 5. Rủi ro kỹ thuật & Giải pháp phòng ngừa

1. **Thanh toán thành công ở Gateway nhưng Backend gặp lỗi CSDL**:
   - Sử dụng transaction context `tx` bọc toàn bộ bước tạo `Order`, trừ tồn kho `Stock` và cập nhật `Payment`. Nếu lỗi, tự động rollback và duy trì bản ghi `PaymentEvent` để đối soát lại.
2. **Webhook gửi lặp (Duplicate Webhook)**:
   - Lưu trữ `eventId` duy nhất trong bảng `PaymentEvent`. Nếu trùng lặp ID và hash, hệ thống bỏ qua an toàn (Idempotency).
3. **Tranh chấp mua món hàng cuối cùng (Race Condition)**:
   - Áp dụng lệnh SQL nguyên tử trực tiếp trong PostgreSQL: `UPDATE "Stock" SET reserved = reserved + $qty WHERE "productId" = $id AND ("onHand" - reserved) >= $qty`. Đảm bảo chỉ duy nhất một khách hàng giữ hàng thành công.

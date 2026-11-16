# Hợp đồng REST dự thảo


## Đối chiếu kiến trúc hiện hành

Bảng endpoint/DTO bên dưới là bản đề xuất trước implementation, không phải contract hiện hành. Contract hiện có tại [design/api.md](design/api.md); ví dụ /checkout-sessions đã được cụ thể hóa thành /v1/carts, operation key trong JSON. Cấu trúc đích route → middleware/controller → service → repository; chỉ BE/Prisma kết nối DB host riêng, frontend không kết nối DB. Code refactor chưa được thực hiện.

Nguồn ưu tiên: [kiến trúc đã chốt](design/architecture.md), [quyết định](decisions/decisions.md), [trạng thái bàn giao](handoff/latest.md).

Ngày lập: 05/11/2026. **REFERENCE — contract dự thảo ban đầu; server thử đã có, contract hiện hành tại design/api.md, chưa có OpenAPI đầy đủ.** Owner BE/TL, đối chiếu FE/QA. Đây là bảng hợp đồng để rà soát trước OpenAPI, không chứng nhận G6 mức Chuẩn. [Quyền](02-requirements.md), [dữ liệu](03-data.md), [kiến trúc](03-tech.md).

## Quy ước chung

Base path `/v1`; JSON camelCase, `Content-Type: application/json`; UUID cho ID, ngày ISO 8601 UTC. Optional field trả `null` nhất quán thay vì bỏ bất ngờ. Tiền dạng chuỗi số nguyên không âm + currency `VND` đề xuất, không nhận tổng từ browser làm nguồn sự thật. Không truyền proof/token trong URL. D06 đã chọn session server/cookie cùng origin; TTL/CSRF chi tiết còn TBD; ký hiệu “chủ phiên” dưới đây luôn bao gồm bằng chứng sở hữu ngoài ID.

Đề xuất giới hạn: code/SKU/barcode 1–64 ký tự sau trim; name 1–200; quantity nguyên 1–999; số tiền tối đa và số dòng giỏ TBD trước Ready. Barcode giữ số 0 đầu; SKU chuẩn hóa hoa; không giả định barcode chỉ có một chuẩn độ dài. Body tối đa đề xuất 64 KiB cho mutation thông thường; callback D07 chốt riêng. Reject unknown fields, validate nội dung và quyền ở backend. Các giới hạn mới cần PO/TL duyệt, không gán cho nguồn.

Response thành công mutation trả DTO mới và version; tạo mới 201 + Location. Danh sách có `{items, page, limit, total}` nếu dùng offset; đề xuất giám sát dùng `{items,nextCursor}` keyset. Default limit 20, max 100, vượt trả 400; sort/filter allowlist có index. Các GET item array của một aggregate giỏ phải có giới hạn số dòng rõ; nếu vượt khả năng trả một aggregate thì phân trang, không trả danh sách vô hạn.

Lỗi thống nhất:

```json
{
  "error": {
    "code": "CART_VERSION_CONFLICT",
    "message": "Giỏ hàng đã thay đổi. Hãy kiểm tra lại giỏ.",
    "details": [{ "field": "version", "issue": "stale" }],
    "requestId": "request-reference"
  }
}
```

`request-reference` chỉ là mô tả mã truy vết, không phải credential. HTTP 400 sai cú pháp/kiểu; 401 chưa xác thực; 403 sai quyền chức năng; 404 không thấy hoặc không được lộ đối tượng khác; 409 state/version/unique/key conflict; 422 nghiệp vụ như quantity không hợp lệ; 429 rate limit; 500 lỗi nội bộ; 503 dependency không sẵn sàng. Không 200 kèm cờ lỗi, không stack/SQL trong message. `X-Request-Id` tương ứng error.requestId.

## Slice đầu S1

| Endpoint / story                                    | Input và quyền                                                                     | Kết quả / tác động                                                                             | Lỗi chính                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| GET /products?code={code}, US01                     | Public có chủ đích; code bắt buộc, trim không rỗng                                 | 200 ProductPublic; không ghi DB                                                                | 400 code, 404 PRODUCT_NOT_FOUND, 429, 503                                       |
| POST /checkout-sessions, US02                       | Khách, body rỗng; rate limit                                                       | 201 SessionCart rỗng + cơ chế ownership D06; Location; không trả hash                          | 400 unknown field, 429, 503                                                     |
| GET /checkout-sessions/{id}, US02/04                | Chủ phiên; UUID                                                                    | 200 SessionCart; Staff không dùng handler này nếu chưa được duyệt                              | 401, 404, 503                                                                   |
| POST /checkout-sessions/{id}/items, US02            | Chủ phiên; productId, quantity, version; Idempotency-Key cho một lần thêm chủ động | 201 khi dòng mới, 200 khi tăng dòng hiện có; trả SessionCart; operation key chống response mất | 404, 409 CART_LOCKED/VERSION_CONFLICT/KEY_REUSED, 422 PRODUCT_INACTIVE/quantity |
| PATCH /checkout-sessions/{id}/items/{itemId}, US04  | Chủ phiên; quantity và version bắt buộc                                            | 200 SessionCart; thay lượng tuyệt đối, tăng version                                            | 404 kể cả item không thuộc session, 409, 422                                    |
| DELETE /checkout-sessions/{id}/items/{itemId}, US04 | Chủ phiên; If-Match version, item thuộc phiên                                      | 200 SessionCart; xóa cuối giữ active/tổng 0                                                    | 404, 409 CART_LOCKED/VERSION_CONFLICT                                           |

Tra cứu code trả một tài nguyên khớp duy nhất, không phải danh sách catalog. Nếu một code khớp barcode sản phẩm A và SKU sản phẩm B, không chọn tùy tiện: D01/PO phải chốt namespace hoặc trả `409 PRODUCT_CODE_AMBIGUOUS`, UI yêu cầu chọn loại mã. Unique từng cột không tự loại xung đột xuyên hai loại mã.

DELETE lặp không xóa thêm dòng; có thể trả 404 nếu dòng đã mất, hiệu ứng vẫn idempotent. Khi cần replay response giống hệt, dùng operation record theo chính sách được duyệt. Không tạo operation key mới tự động khi mất response của POST thêm hàng.

### DTO S1

| DTO           | Trường / loại / nghĩa                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ProductPublic | id UUID; name string; sku string; barcode string; unitPrice chuỗi số nguyên; currency string; imageUrl string hoặc null. Không trả stock nội bộ/actor/hash                                                                                 |
| CartItem      | id UUID; productId UUID; name/sku/barcode string; quantity integer; unitPrice chuỗi số nguyên; lineTotal chuỗi số nguyên = unitPrice × quantity                                                                                            |
| SessionCart   | id UUID; status active/completed/cancelled; version integer >0; expiresAt date-time; items CartItem[] bị giới hạn; totalAmount chuỗi số nguyên; currency; cartLocked boolean; lockReason string hoặc null; currentPaymentId UUID hoặc null |

Ví dụ yêu cầu thêm hàng, không chứa credentials:

```json
{
  "productId": "43c483d4-46fa-4ca8-8c45-7fbe0e96e671",
  "quantity": 1,
  "version": 1
}
```

Tên sản phẩm/giá trong giỏ do server trả, không nhận từ request. Bất kỳ state/version/ownership nào sai đều không thay đổi dữ liệu. If-Match dùng ETag version được quy định trong OpenAPI, không chấp nhận parse tùy tiện; thiếu version/If-Match trả 400 trong contract dự thảo này.

## Các slice sau

| Endpoint                              | Quyền / input cần đặc tả                                                                                                 | Kết quả và guard                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST /checkout-sessions/{id}/cancel   | Chủ phiên, version, D03                                                                                                  | 200 cancelled; unresolved →409; không cho Staff hủy                                                                                                                                          |
| POST /checkout-sessions/{id}/payments | Chủ phiên, version + acceptedAmount/currency đã hiển thị; Idempotency-Key                                                | 201 Payment sau reprice/xác nhận và giữ đủ hàng atomic trước gọi gateway; đổi giá →409 PRICE_CHANGED; thiếu available →409 INSUFFICIENT_STOCK, rollback toàn bộ giữ hàng và chưa gọi gateway |
| GET /payments/{id}                    | Chủ phiên/payment                                                                                                        | 200 Payment; query không tạo attempt mới                                                                                                                                                     |
| GET /orders/{id}/receipt              | Chủ phiên/order                                                                                                          | 200 Receipt snapshot; không suy quyền từ order ID                                                                                                                                            |
| POST /payment-events                  | Chỉ gateway đã xác minh; eventId, merchantReference, gatewayReference, status, amount, currency, thời điểm/signature D07 | ACK sau lưu event bền vững; duplicate retry công việc chưa xong; sai chữ ký reject; không có DTO browser giả success                                                                         |
| POST /auth/login                      | Nhân sự, username/password qua TLS, rate limit                                                                           | 200 safe identity + session D06; không trả hash; lỗi chung                                                                                                                                   |
| POST /auth/logout                     | Phiên nhân sự hợp lệ + CSRF D06                                                                                          | 204, thu hồi server; gọi lại không tác dụng thêm                                                                                                                                             |
| GET /auth/session                     | Nhân sự đã xác thực                                                                                                      | 200 id/role/quyền tối thiểu; 401 hết hạn                                                                                                                                                     |
| GET /admin/products                   | Admin; q/page/limit/sort allowlist                                                                                       | 200 danh mục có cả inactive, phân trang                                                                                                                                                      |
| POST /products                        | Admin; name/sku/barcode/unitPrice/currency/imageUrl tùy chọn                                                             | 201 ProductAdmin; unique/audit, actor lấy từ auth                                                                                                                                            |
| PATCH /products/{id}                  | Admin; field allowlist + version                                                                                         | 200; ngừng bán bằng isActive=false; không xóa lịch sử                                                                                                                                        |
| GET /inventory                        | Admin; code/page/limit                                                                                                   | 200 rows onHand; reserved/available theo D05 đã chọn                                                                                                                                         |
| GET /monitoring/sessions              | Staff/Admin có quyền; status/cursor/limit                                                                                | 200 items,nextCursor,asOf; khách không đọc danh sách                                                                                                                                         |
| GET /monitoring/sessions/{id}         | Staff/Admin trong phạm vi được cấp                                                                                       | 200 giỏ/payment DTO đã lọc; không cấp quyền ghi                                                                                                                                              |
| GET /reports/transactions             | Admin; start/end/status/page/limit                                                                                       | 200 attempts theo trạng thái, không cộng event thành attempts                                                                                                                                |
| GET /reports/revenue                  | Admin; start/end                                                                                                         | 200 tổng từ completed orders, [start,end), currency                                                                                                                                          |
| GET /health                           | Công khai có chủ đích, không credentials                                                                                 | 200 liveness an toàn; readiness nội bộ/được giới hạn, 503 khi chưa sẵn sàng                                                                                                                  |

Đường `/monitoring` tách quyền xem nhân sự khỏi ownership route của khách; đây là làm rõ đề xuất từ endpoint giám sát trong kế hoạch, không thêm quyền nghiệp vụ mới. Admin đọc catalog quản trị có route riêng để tránh lộ inactive/actor trong public lookup.

Payment DTO tối thiểu: id, sessionId, status (initiating/pending/unknown/success/failure), completionStatus (waiting/completed/reconciliation_required), amount, currency, qrPayload nullable, orderId nullable, updatedAt, nextAction. Gateway success chưa completed không trả receipt có vẻ đã phát hành. Receipt DTO: id/orderId/issuedAt, snapshot items, currency, totalAmount từ đơn; không đọc giá hiện hành. QR chỉ mock, không phải bằng chứng đã thanh toán.

## Idempotency, callback và phần chưa khóa

Key scope gắn chủ phiên + operation; lưu digest key/payload và response hoặc liên kết kết quả trong DB. Cùng key/payload → trả cùng tài nguyên/kết quả; cùng key/khác payload →409; cùng session khác key khi unresolved →409. Thời hạn giữ key không được ngắn hơn cửa sổ retry/replay có thể xảy ra; D07/D11 quyết định. Không commit ví dụ giá trị key/token/secret.

D07 đã chọn mock gateway riêng, callback xác minh và query trạng thái; chi tiết còn mở: thuật toán ký, canonicalization/raw body, timestamp tolerance, replay window, max body, retry ACK codes, quy tắc terminal mâu thuẫn, query status và gateway idempotency. Phải chốt contract trước triển khai signature test; không tự thiết kế chữ ký bằng mô tả mơ hồ. Timeout query vẫn là unknown, không tự failure.

Trước G6: chuyển hợp đồng slice đầu đã duyệt thành `docs/openapi.yaml` với schema từng field, required/nullable/length/range, security schemes D06, request/response/examples, mọi status và operationId; validate bằng parser/linter và contract tests. Các slice tiếp theo mở rộng OpenAPI khi Ready. File YAML chưa tạo; auth đã chọn nhưng TTL/security schema và giới hạn chưa hoàn thiện; bảng này không được gọi là OpenAPI đầy đủ.

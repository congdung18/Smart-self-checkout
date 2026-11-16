import { useState } from "react";
import { api, money, type Cart, type Payment, type Product } from "../api";
import { statusText, type Confirmation } from "../components";
import { navigate, type Page } from "../routing";
import { Scanner } from "../Scanner";
type Props = {
  page: Page;
  cart: Cart | null;
  payment: Payment | null;
  disabled: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  mutate: (work: () => Promise<Cart>) => Promise<void>;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  pay: (scenario: string) => Promise<void>;
  confirm: (value: Confirmation) => void;
  notify: (text: string) => void;
};
export function CustomerPage({
  page,
  cart,
  payment,
  disabled,
  run,
  mutate,
  refresh,
  start,
  pay,
  confirm,
  notify,
}: Props) {
  const [code, setCode] = useState(""),
    [product, setProduct] = useState<Product | null>(null),
    [scenario, setScenario] = useState("pending");
  async function lookup(value: string) {
    setCode(value);
    setProduct(null);
    setProduct(
      await api<Product>(`/products?code=${encodeURIComponent(value)}`),
    );
  }
  async function add() {
    if (!cart || !product) return;
    const key = `ssc:add:${cart.id}:${cart.version}:${product.id}`;
    await mutate(() =>
      api<Cart>(`/carts/${cart.id}/items`, "POST", {
        productId: product.id,
        quantity: 1,
        version: cart.version,
        key,
      }),
    );
    notify(`Đã thêm ${product.name} vào giỏ.`);
    setProduct(null);
  }
  const items = cart?.items ?? [];
  const frozen = payment?.order?.items ?? payment?.snapshot ?? [];
  const total = cart?.amount ?? 0;
  if (page === "home")
    return (
      <div className="two-columns">
        <section className="panel home-intro">
          <span className="home-symbol" aria-hidden="true">
            ▣
          </span>
          <h2>Mua sắm chủ động, không cần xếp hàng</h2>
          <p>
            Quét mã sản phẩm, kiểm tra giỏ hàng và thanh toán bằng mã QR mô
            phỏng ngay trên thiết bị của bạn.
          </p>
          <ol className="steps">
            <li>1 · Quét sản phẩm</li>
            <li>2 · Kiểm tra giỏ</li>
            <li>3 · Thanh toán</li>
          </ol>
          {cart?.status === "completed" ? (
            <>
              <button onClick={() => navigate("receipt")}>Xem xác nhận</button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => void run(start)}
              >
                Bắt đầu phiên mới
              </button>
            </>
          ) : cart?.locked && cart.status === "active" ? (
            <button onClick={() => navigate("payment")}>
              Theo dõi thanh toán →
            </button>
          ) : (
            <button disabled={disabled} onClick={() => void run(start)}>
              Bắt đầu quét sản phẩm →
            </button>
          )}
        </section>
        <section className="panel">
          <h2>Phiên mua sắm</h2>
          <p>
            {cart
              ? `Phiên ${cart.id.slice(0, 8)} · ${statusText[cart.status]}`
              : "Chưa bắt đầu phiên mua hàng"}
          </p>
          <div className="stat">
            <span>Sản phẩm trong giỏ</span>
            <strong>{items.reduce((sum, x) => sum + x.quantity, 0)}</strong>
            <span>Tạm tính: {money(total)}</span>
          </div>
          <p>Bạn có thể nhập mã thủ công khi camera không khả dụng.</p>
          <button className="secondary" onClick={() => navigate("cart")}>
            Xem giỏ hàng
          </button>
        </section>
      </div>
    );
  if (page === "scan")
    return (
      <>
        <ol className="steps">
          <li aria-current="step">1 · Quét sản phẩm</li>
          <li>2 · Kiểm tra giỏ</li>
          <li>3 · Thanh toán</li>
        </ol>
        <div className="two-columns">
          <section className="panel">
            <h2>Quét mã qua camera</h2>
            <Scanner onCode={(value) => void run(() => lookup(value))} />
          </section>
          <section className="panel">
            <h2>Nhập mã thủ công</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => lookup(code));
              }}
            >
              <label htmlFor="barcode">Barcode hoặc SKU</label>
              <input
                id="barcode"
                value={code}
                maxLength={64}
                required
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ví dụ: MILK001"
              />
              <p className="hint">
                Thử: MILK001, BREAD002, WATER003, COFFEE004, NOODLE005
              </p>
              <button
                disabled={disabled}
                className={product ? "secondary" : ""}
              >
                Tra cứu sản phẩm
              </button>
            </form>
            {product && (
              <div className="product-preview" role="status">
                <div>
                  <h3>{product.name}</h3>
                  <p>
                    {product.sku} · {product.barcode}
                  </p>
                  <strong>{money(product.price)}</strong>
                </div>
                {cart?.status === "active" ? (
                  <button
                    disabled={disabled || cart.locked}
                    onClick={() => void run(add)}
                  >
                    Thêm vào giỏ
                  </button>
                ) : (
                  <button disabled={disabled} onClick={() => void run(start)}>
                    Bắt đầu phiên mua
                  </button>
                )}
              </div>
            )}
            <p className="hint">
              Quét mã chỉ tra cứu. Kiểm tra sản phẩm rồi bấm Thêm.
            </p>
            <div className="row between">
              <span>
                Giỏ hàng: {items.reduce((sum, x) => sum + x.quantity, 0)} sản
                phẩm
              </span>
              <button className="secondary" onClick={() => navigate("cart")}>
                Xem giỏ hàng →
              </button>
            </div>
          </section>
        </div>
      </>
    );
  if (page === "cart")
    return (
      <div className="two-columns">
        <section className="panel">
          <div className="row between">
            <h2>Danh sách sản phẩm ({items.length})</h2>
            <button className="secondary" onClick={() => navigate("scan")}>
              + Quét thêm
            </button>
          </div>
          {items.length ? (
            <ul className="cart-list">
              {items.map((item) => (
                <li key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <small>
                      {item.sku} · {money(item.unitPrice)} / sản phẩm
                    </small>
                    <div className="quantity">
                      <button
                        className="secondary"
                        aria-label={`Giảm ${item.name}`}
                        disabled={
                          disabled || cart!.locked || item.quantity <= 1
                        }
                        onClick={() =>
                          void run(() =>
                            mutate(() =>
                              api<Cart>(
                                `/carts/${cart!.id}/items/${item.id}`,
                                "PATCH",
                                {
                                  quantity: item.quantity - 1,
                                  version: cart!.version,
                                },
                              ),
                            ),
                          )
                        }
                      >
                        −
                      </button>
                      <span aria-label="Số lượng">{item.quantity}</span>
                      <button
                        className="secondary"
                        aria-label={`Tăng ${item.name}`}
                        disabled={
                          disabled || cart!.locked || item.quantity >= 999
                        }
                        onClick={() =>
                          void run(() =>
                            mutate(() =>
                              api<Cart>(
                                `/carts/${cart!.id}/items/${item.id}`,
                                "PATCH",
                                {
                                  quantity: item.quantity + 1,
                                  version: cart!.version,
                                },
                              ),
                            ),
                          )
                        }
                      >
                        +
                      </button>
                      <button
                        className="text-danger"
                        disabled={disabled || cart!.locked}
                        onClick={() =>
                          confirm({
                            text: `Xóa ${item.name} khỏi giỏ?`,
                            action: () =>
                              mutate(() =>
                                api<Cart>(
                                  `/carts/${cart!.id}/items/${item.id}`,
                                  "DELETE",
                                  { version: cart!.version, confirmed: true },
                                ),
                              ),
                          })
                        }
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                  <b>{money(item.unitPrice * item.quantity)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <h3>Giỏ hàng đang trống</h3>
              <p>Quét hoặc nhập mã sản phẩm để bắt đầu mua sắm.</p>
              <button className="secondary" onClick={() => navigate("scan")}>
                Thêm sản phẩm
              </button>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Tóm tắt đơn hàng</h2>
          <p>
            Số lượng sản phẩm: {items.reduce((sum, x) => sum + x.quantity, 0)}
          </p>
          <div className="total">
            <span>Tổng thanh toán</span>
            <strong>{money(total)}</strong>
          </div>
          <p>Giá được xác nhận trước khi tạo giao dịch.</p>
          <button
            disabled={disabled || !items.length}
            onClick={() =>
              navigate(cart?.status === "completed" ? "receipt" : "payment")
            }
          >
            {cart?.status === "completed"
              ? "Xem xác nhận"
              : cart?.locked
                ? "Theo dõi thanh toán →"
                : "Tiếp tục thanh toán →"}
          </button>
          {cart?.status === "active" && (
            <button
              className="text-danger"
              disabled={disabled || cart.locked}
              onClick={() =>
                confirm({
                  text: "Hủy lượt mua này? Bạn sẽ không thể thanh toán giỏ đã hủy.",
                  action: () =>
                    mutate(() =>
                      api<Cart>(`/carts/${cart.id}/cancel`, "POST", {
                        version: cart.version,
                        confirmed: true,
                      }),
                    ),
                })
              }
            >
              Hủy lượt mua
            </button>
          )}
          {cart?.status === "cancelled" && (
            <>
              <p>Phiên đã hủy.</p>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => void run(start)}
              >
                Bắt đầu phiên mới
              </button>
            </>
          )}
        </section>
      </div>
    );
  if (page === "receipt")
    return payment?.order ? (
      <section className="panel receipt">
        <h2>Mua hàng hoàn tất</h2>
        <p>Xác nhận giao dịch mô phỏng, không phải hóa đơn điện tử pháp lý.</p>
        <p>Mã đơn: {payment.order.id}</p>
        <p>Mã giao dịch: {payment.id}</p>
        <p>
          {new Date(payment.order.completedAt).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          })}
        </p>
        <ul className="receipt-lines">
          {frozen.map((item, i) => (
            <li key={i}>
              <span>
                {item.name} × {item.quantity}
                <small>{item.sku}</small>
              </span>
              <b>{money(item.unitPrice * item.quantity)}</b>
            </li>
          ))}
        </ul>
        <div className="total">
          <span>Đã thanh toán</span>
          <strong>{money(payment.amount)}</strong>
        </div>
        <button disabled={disabled} onClick={() => void run(start)}>
          Bắt đầu lượt mua mới
        </button>
      </section>
    ) : (
      <section className="panel empty">
        <h2>Chưa có xác nhận cho phiên này</h2>
        <p>
          Chỉ giao dịch được xác minh thành công và hoàn tất đơn mới có xác
          nhận.
        </p>
        <button onClick={() => navigate("payment")}>Kiểm tra thanh toán</button>
      </section>
    );
  if (page === "payment") {
    if (payment?.order)
      return (
        <section className="panel">
          <h2>Phiên đã hoàn tất</h2>
          <button onClick={() => navigate("receipt")}>Xem xác nhận</button>
        </section>
      );
    if (cart?.status === "cancelled")
      return (
        <section className="panel">
          <h2>Phiên đã hủy</h2>
          <button disabled={disabled} onClick={() => void run(start)}>
            Bắt đầu phiên mới
          </button>
        </section>
      );
    const locked = !!(payment && cart?.locked);
    return (
      <div className="two-columns">
        <section className="panel">
          <h2>
            {locked ? statusText[payment!.status] : "Xác nhận thanh toán"}
          </h2>
          {locked ? (
            <>
              <p className="banner warning" role="status">
                {payment!.status === "success"
                  ? "Gateway đã xác nhận thành công. Đang hoàn tất đơn hoặc cần đối soát. Không thanh toán lại."
                  : "Hàng được giữ cho giao dịch này. Không thanh toán lại hoặc sửa giỏ khi chưa rõ kết quả."}
              </p>
              <p>Mã giao dịch: {payment!.id}</p>
              <img
                className="qr"
                src={payment!.qr}
                alt="QR thanh toán mô phỏng, không sử dụng tiền thật"
              />
              <button disabled={disabled} onClick={() => void run(refresh)}>
                Kiểm tra trạng thái
              </button>
              <details className="demo-tools">
                <summary>Công cụ mô phỏng kết quả gateway</summary>
                <p>Chỉ dùng trong demo, không sử dụng tiền thật.</p>
                <div className="actions">
                  {(["success", "failure"] as const).map((status) => (
                    <button
                      key={status}
                      className="secondary"
                      disabled={disabled}
                      onClick={() =>
                        void run(async () => {
                          await api(
                            `/payments/${payment!.id}/simulate`,
                            "POST",
                            { status },
                          );
                          await refresh();
                        })
                      }
                    >
                      {status === "success"
                        ? "Mô phỏng thành công"
                        : "Mô phỏng thất bại"}
                    </button>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <>
              {payment?.status === "failure" && (
                <p className="banner error" role="status">
                  Giao dịch trước đã xác minh thất bại. Bạn có thể sửa giỏ hoặc
                  thử lại.
                </p>
              )}
              <p>
                Kiểm tra tổng tiền. Khi tạo giao dịch, tên hàng, giá và số lượng
                được chốt; giỏ tạm khóa.
              </p>
              <label htmlFor="scenario">Kịch bản gateway demo</label>
              <select
                id="scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                disabled={disabled}
              >
                <option value="pending">
                  Chờ kết quả (điều khiển thủ công)
                </option>
                <option value="success">Thành công</option>
                <option value="failure">Thất bại</option>
                <option value="timeout">
                  Timeout, sau đó trả kết quả muộn
                </option>
                <option value="duplicate">
                  Callback thành công lặp hai lần
                </option>
              </select>
              <button
                disabled={disabled || !items.length}
                onClick={() =>
                  confirm({
                    text: `Xác nhận giỏ ${money(total)} và giữ hàng để thanh toán mô phỏng?`,
                    action: () => pay(scenario),
                  })
                }
              >
                Tạo mã thanh toán mô phỏng
              </button>
              {!items.length && (
                <p>Giỏ hàng đang trống; thêm sản phẩm trước khi thanh toán.</p>
              )}
            </>
          )}
          <button className="secondary back" onClick={() => navigate("cart")}>
            ← Quay lại giỏ hàng
          </button>
        </section>
        <section className="panel">
          <h2>Chi tiết thanh toán</h2>
          <ul className="receipt-lines">
            {(locked ? frozen : items).map((item, i) => (
              <li key={i}>
                <span>
                  {item.name} × {item.quantity}
                </span>
                <b>{money(item.unitPrice * item.quantity)}</b>
              </li>
            ))}
          </ul>
          <div className="total">
            <span>Tổng cộng</span>
            <strong>{money(locked ? payment!.amount : total)}</strong>
          </div>
        </section>
      </div>
    );
  }
  return null;
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, setCsrf, type Cart, type Payment, type User } from "./api";
import {
  ConfirmDialog,
  errorText,
  Loading,
  PageTitle,
  type Confirmation,
} from "./components";
import { navigate, paths, useRoute, type Page } from "./routing";
import { CustomerPage } from "./pages/Customer";
import { LoginPage } from "./pages/Login";
import {
  MonitorPage,
  ProductForm,
  ProductsPage,
  ReportsPage,
} from "./pages/Admin";
import "./style.css";
const titles: Partial<Record<Page, string>> = {
  home: "Tự thanh toán dễ dàng",
  scan: "Quét và thêm sản phẩm",
  cart: "Giỏ hàng của bạn",
  payment: "Thanh toán đơn hàng",
  receipt: "Hóa đơn xác nhận",
};
function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false),
    [cart, setCart] = useState<Cart | null>(null),
    [payment, setPayment] = useState<Payment | null>(null),
    [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const booting = useRef(false),
    pendingKeys = useRef(new Map<string, string>());
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, []);
  const refreshCart = useCallback(async (id: string) => {
    const c = await api<Cart>(`/carts/${id}`);
    const p = c.paymentId
      ? await api<Payment>(`/payments/${c.paymentId}`)
      : null;
    setCart(
      p?.order && c.status !== "completed"
        ? await api<Cart>(`/carts/${id}`)
        : c,
    );
    setPayment(p);
    if (p?.order && location.hash === "#/customer/payment") navigate("receipt");
  }, []);
  const boot = useCallback(async () => {
    const result = await api<{ csrf: string; user: User | null }>("/bootstrap");
    setCsrf(result.csrf);
    setUser(result.user);
    const current = await api<Cart | null>("/carts/current");
    if (current) await refreshCart(current.id);
    setReady(true);
  }, [refreshCart]);
  useEffect(() => {
    if (!booting.current) {
      booting.current = true;
      void run(boot);
    }
  }, [boot, run]);
  useEffect(() => {
    const on = () => setOffline(false),
      off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    setError("");
  }, [route.page, route.productId]);
  async function start() {
    if (cart?.status === "active" && cart.locked) {
      navigate("payment");
      return;
    }
    const c = await api<Cart>("/carts", "POST", {});
    setCart(c);
    setPayment(null);
    navigate("scan");
  }
  async function mutate(work: () => Promise<Cart>) {
    if (!cart) return;
    try {
      setCart(await work());
    } finally {
      await refreshCart(cart.id);
    }
  }
  async function pay(scenario: string) {
    if (!cart) return;
    const operation = `pay:${cart.id}:${cart.version}:${scenario}`;
    if (payment?.status === "failure") pendingKeys.current.delete(operation);
    if (!pendingKeys.current.has(operation))
      pendingKeys.current.set(operation, crypto.randomUUID());
    try {
      await api(`/carts/${cart.id}/payments`, "POST", {
        version: cart.version,
        acceptedAmount: cart.amount,
        scenario,
        key: pendingKeys.current.get(operation),
      });
      pendingKeys.current.delete(operation);
    } finally {
      await refreshCart(cart.id);
    }
  }
  const disabled = busy || offline || !ready;
  const needsLogin = route.audience !== "customer" && !user;
  const forbidden = route.audience === "admin" && user && user.role !== "admin";
  const operations = !!user && route.audience !== "customer";
  const menu: [Page, string][] = operations
    ? user?.role === "admin"
      ? [
          ["products", "Sản phẩm"],
          ["inventory", "Tồn kho"],
          ["reports", "Báo cáo"],
          ["monitor", "Giám sát phiên"],
        ]
      : [["monitor", "Giám sát phiên"]]
    : [
        ["home", "Bắt đầu"],
        ["scan", "Quét sản phẩm"],
        ["cart", "Giỏ hàng"],
        ["payment", "Thanh toán"],
      ];
  const navigation = (label: string) => (
    <nav aria-label={label}>
      {menu.map(([page, text]) => (
        <a
          key={page}
          className={
            route.page === page ||
            (page === "products" && route.page === "productForm")
              ? "navbtn active"
              : "navbtn"
          }
          aria-current={
            route.page === page ||
            (page === "products" && route.page === "productForm")
              ? "page"
              : undefined
          }
          href={`#${page === "monitor" && user?.role === "admin" ? "/admin/sessions" : paths[page]}`}
        >
          {text}
        </a>
      ))}
    </nav>
  );
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Đến nội dung chính
      </a>
      <header className="top">
        <a className="brand" href="#/customer/home">
          <span className="brand-mark" aria-hidden="true">
            ▣
          </span>
          <span>
            SMART<span className="brand-light">CHECKOUT</span>
          </span>
        </a>
        <div className="header-actions">
          <span className="demo-label">Prototype · dữ liệu mô phỏng</span>
          {user ? (
            <>
              <button
                className="secondary"
                onClick={() =>
                  navigate(
                    operations ? "home" : "monitor",
                    undefined,
                    user.role === "admin",
                  )
                }
              >
                {operations ? "Mua hàng" : "Không gian nhân sự"}
              </button>
              <button
                className="secondary"
                disabled={busy || offline}
                onClick={() =>
                  void run(async () => {
                    await api("/auth/logout", "POST", {});
                    location.href = "#/customer/home";
                    location.reload();
                  })
                }
              >
                Đăng xuất {user.username}
              </button>
            </>
          ) : (
            <button className="secondary" onClick={() => navigate("login")}>
              Nhân sự đăng nhập
            </button>
          )}
        </div>
      </header>
      <div className="layout">
        <aside>
          <h2>{operations ? "QUẢN TRỊ" : "MUA SẮM"}</h2>
          {navigation("Điều hướng bên")}
          <p className="sidebar-note">
            Bản mẫu phục vụ kiểm thử UI/UX. Không sử dụng tiền thật.
          </p>
        </aside>
        <div className="content">
          <main id="main" tabIndex={-1}>
            {offline && (
              <p className="banner warning" role="status">
                Bạn đang ngoại tuyến. Dữ liệu cũ vẫn hiển thị, các thao tác ghi
                đang khóa.
              </p>
            )}
            {error && (
              <div className="banner error" role="alert">
                <span>{error}</span>
                <button
                  className="secondary"
                  disabled={busy || offline}
                  onClick={() =>
                    void run(ready && cart ? () => refreshCart(cart.id) : boot)
                  }
                >
                  Tải lại dữ liệu
                </button>
              </div>
            )}
            {notice && (
              <p className="banner success" role="status">
                {notice}
              </p>
            )}
            {busy && ready && <p role="status">Đang xử lý yêu cầu…</p>}
            {!ready ? (
              <>
                <PageTitle title="Smart Self-Checkout" />
                {!error && (
                  <>
                    <p role="status">Đang khôi phục phiên mua hàng…</p>
                    <Loading />
                  </>
                )}
              </>
            ) : needsLogin || route.page === "login" ? (
              <LoginPage
                disabled={busy || offline}
                loggedIn={(person) => {
                  setUser(person);
                  if (
                    route.audience !== "customer" &&
                    (route.audience !== "admin" || person.role === "admin")
                  )
                    navigate(
                      route.page,
                      route.productId,
                      route.audience === "admin",
                    );
                  else navigate("monitor", undefined, person.role === "admin");
                }}
              />
            ) : forbidden ? (
              <>
                <PageTitle title="Không có quyền truy cập" />
                <p className="banner error" role="alert">
                  Tài khoản Staff chỉ được xem giám sát.
                </p>
                <button onClick={() => navigate("monitor")}>Về giám sát</button>
              </>
            ) : operations ? (
              <>
                {route.page === "monitor" && <MonitorPage offline={offline} />}
                {(route.page === "products" || route.page === "inventory") && (
                  <ProductsPage
                    key={route.page}
                    inventoryOnly={route.page === "inventory"}
                    offline={offline}
                  />
                )}
                {route.page === "productForm" && (
                  <ProductForm
                    key={route.productId ?? "new"}
                    id={route.productId}
                    offline={offline}
                    confirm={setConfirmation}
                    notify={setNotice}
                  />
                )}
                {route.page === "reports" && <ReportsPage offline={offline} />}
              </>
            ) : (
              <>
                <PageTitle title={titles[route.page] || "Smart Self-Checkout"}>
                  <p>
                    {cart
                      ? `Phiên ${cart.id.slice(0, 8)} · ${cart.locked ? "Đang khóa" : "Đang hoạt động"}`
                      : "Bắt đầu phiên mua sắm và làm theo hướng dẫn."}
                  </p>
                </PageTitle>
                <CustomerPage
                  page={route.page}
                  cart={cart}
                  payment={payment}
                  disabled={disabled}
                  run={run}
                  mutate={mutate}
                  refresh={() => (cart ? refreshCart(cart.id) : boot())}
                  start={start}
                  pay={pay}
                  confirm={setConfirmation}
                  notify={setNotice}
                />
              </>
            )}
          </main>
          <footer>
            Prototype UI/UX · dữ liệu và thanh toán mô phỏng. Đồ án Smart
            Self-Checkout.
          </footer>
        </div>
      </div>
      <div className="mobile-nav">{navigation("Điều hướng di động")}</div>
      <ConfirmDialog
        value={confirmation}
        close={() => setConfirmation(null)}
        run={run}
        busy={disabled}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

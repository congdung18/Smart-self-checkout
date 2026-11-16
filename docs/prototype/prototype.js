const catalog = [
  {
    id: 1,
    name: "Sữa tươi không đường 1L",
    sku: "MILK001",
    barcode: "8931000000011",
    price: 34000,
    stock: 42,
    emoji: "🥛",
    active: true,
  },
  {
    id: 2,
    name: "Bánh mì sandwich",
    sku: "BREAD002",
    barcode: "8931000000028",
    price: 28000,
    stock: 25,
    emoji: "🍞",
    active: true,
  },
  {
    id: 3,
    name: "Nước suối 500ml",
    sku: "WATER003",
    barcode: "8931000000035",
    price: 9000,
    stock: 120,
    emoji: "💧",
    active: true,
  },
  {
    id: 4,
    name: "Cà phê lon 240ml",
    sku: "COFFEE004",
    barcode: "8931000000042",
    price: 18000,
    stock: 8,
    emoji: "☕",
    active: true,
  },
  {
    id: 5,
    name: "Mì ăn liền",
    sku: "NOODLE005",
    barcode: "8931000000059",
    price: 7500,
    stock: 0,
    emoji: "🍜",
    active: true,
  },
];
const s = {
  role: "customer",
  page: "home",
  cart: {},
  products: catalog,
  session: 1,
  sessionStatus: "ACTIVE",
  payment: "NONE",
  transaction: 0,
  orders: [],
  dialog: null,
  alert: null,
  lookup: null,
  query: "",
  adminQuery: "",
  editId: null,
  formError: "",
  filter: "all",
  attempts: [],
  paymentSnapshot: null,
  draft: null,
  fieldErrors: {},
  pageNumber: 1,
  dateStart: "2026-11-01",
  dateEnd: "2026-11-30",
  dataState: "normal",
  staffSelected: 0,
};
const format = (n) => new Intl.NumberFormat("vi-VN").format(n) + " ₫";
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (a) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        a
      ],
  );
const pById = (id) => s.products.find((p) => p.id === +id);
const cartRows = () =>
  hasPaymentSnapshot()
    ? s.paymentSnapshot.items.map((x) => ({
        p: {
          ...pById(x.id),
          name: x.name,
          sku: x.sku,
          barcode: x.barcode,
          price: x.unit_price,
        },
        qty: x.qty,
      }))
    : Object.entries(s.cart)
        .map(([id, qty]) => ({ p: pById(id), qty }))
        .filter((x) => x.p);
const total = () =>
  hasPaymentSnapshot()
    ? s.paymentSnapshot.amount
    : cartRows().reduce((a, x) => a + x.p.price * x.qty, 0);
const count = () => cartRows().reduce((a, x) => a + x.qty, 0);
const button = (text, fn, cls = "secondary", extra = "") =>
  `<button type="button" class="button ${cls}" onclick="${fn}" ${extra}>${text}</button>`;
function toast(text, type = "good") {
  s.alert = { text, type };
  render();
}
function setRole(role) {
  if (!menus[role]) return;
  s.role = role;
  nav(
    role === "customer" ? "home" : role === "staff" ? "sessions" : "products",
  );
}
function nav(page) {
  stopCamera();
  s.page = allowedPage(page) ? page : menus[s.role][0][0];
  s.lookup = null;
  s.alert = null;
  s.dataState = "normal";
  s.formError = "";
  s.dialog = null;
  s.pageNumber = 1;
  writeRoute();
  render("page-title");
}
const menus = {
  customer: [
    ["home", "⌂", "Bắt đầu"],
    ["scan", "▣", "Quét sản phẩm"],
    ["cart", "🛒", "Giỏ hàng"],
    ["payment", "▤", "Thanh toán"],
  ],
  staff: [["sessions", "▦", "Giám sát phiên"]],
  admin: [
    ["products", "▣", "Sản phẩm"],
    ["inventory", "▤", "Tồn kho"],
    ["reports", "◫", "Báo cáo"],
    ["sessions", "▦", "Giám sát phiên"],
  ],
};
const title = {
  home: "Tự thanh toán dễ dàng",
  scan: "Quét và thêm sản phẩm",
  cart: "Giỏ hàng của bạn",
  payment: "Thanh toán đơn hàng",
  receipt: "Hóa đơn xác nhận",
  sessions: "Theo dõi phiên mua hàng",
  products: "Quản lý sản phẩm",
  inventory: "Theo dõi tồn kho",
  reports: "Báo cáo giao dịch và doanh thu",
  productForm: s.editId ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới",
};
const desc = {
  home: "Bắt đầu phiên mua sắm và làm theo hướng dẫn.",
  scan: "Quét mã hoặc nhập barcode / SKU để thêm vào giỏ.",
  cart: "Kiểm tra lại sản phẩm và số lượng trước khi thanh toán.",
  payment: "Xác nhận giỏ hàng và thực hiện thanh toán mô phỏng.",
  receipt: "Giao dịch của bạn đã được hệ thống xác nhận.",
  sessions: "Xem trạng thái phiên và hỗ trợ khách hàng khi cần.",
  products: "Thêm, cập nhật và ngừng kinh doanh sản phẩm.",
  inventory: "Tra cứu số lượng tồn kho hiện được ghi nhận.",
  reports: "Tổng hợp từ các đơn hàng hoàn tất trong khoảng thời gian chọn.",
};
function header() {
  let name =
    s.role === "customer"
      ? "Khách hàng"
      : s.role === "staff"
        ? "Nhân viên hỗ trợ"
        : "Quản trị viên";
  return `<header class="top"><div class="brand"><span class="brandmark">▣</span><span>SMART<span style="color:var(--primary)">CHECKOUT</span></span></div><div class="topright"><a class="document-link" href="tai-lieu.html">← Về tài liệu</a><span class="tag">● Prototype · dữ liệu mô phỏng</span><label class="small" for="role">Chế độ xem</label><select id="role" aria-label="Chuyển vai trò demo" onchange="setRole(this.value)" style="border:1px solid var(--border);padding:var(--space-2);border-radius:9px;background:white"><option value="customer" ${s.role === "customer" ? "selected" : ""}>Khách hàng</option><option value="staff" ${s.role === "staff" ? "selected" : ""}>Nhân viên</option><option value="admin" ${s.role === "admin" ? "selected" : ""}>Quản trị viên</option></select></div></header>`;
}
function menu() {
  return `<aside><h3>${s.role === "customer" ? "Mua sắm" : "Quản lý"}</h3><nav>${menus[s.role].map(([page, ic, lab]) => `<button class="navbtn ${s.page === page ? "active" : ""}" onclick="nav('${page}')"><span style="font-size:20px">${ic}</span>${lab}${page === "cart" && count() ? ` · ${count()}` : ""}</button>`).join("")}</nav><div style="margin:var(--space-8) var(--space-3) 0" class="small muted">Bản mẫu phục vụ kiểm thử UI/UX. Không sử dụng tiền thật.</div></aside>`;
}
function mobileMenu() {
  return `<div class="mobile-nav">${menus[s.role].map(([page, ic, lab]) => `<button class="${s.page === page ? "active" : ""}" onclick="nav('${page}')">${ic}<div>${lab}</div></button>`).join("")}</div>`;
}
function heading() {
  return `<div class="pagehead"><div><p class="eyebrow">${s.role === "customer" ? "Trải nghiệm mua sắm" : s.role === "staff" ? "Khu vực hỗ trợ" : "Không gian quản trị"}</p><h1>${s.page === "productForm" ? (s.editId ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới") : title[s.page] || "Smart Self-Checkout"}</h1><p class="muted">${desc[s.page] || ""}</p></div>${s.role === "customer" && s.sessionStatus === "ACTIVE" ? `<span class="tag">Phiên #SC-${String(s.session).padStart(4, "0")} · Đang hoạt động</span>` : ""}</div>`;
}
function statusBox() {
  if (!s.alert) return "";
  return `<div class="notice ${s.alert.type}" role="status">${esc(s.alert.text)} <button class="link" onclick="s.alert=null;render()" aria-label="Đóng thông báo">✕</button></div>`;
}
function home() {
  return `<div class="grid two"><section class="panel"><div style="font-size:48px;margin-bottom:var(--space-3)">🛍️</div><h2>Mua sắm chủ động, không cần xếp hàng</h2><p class="muted">Quét mã sản phẩm, kiểm tra giỏ hàng và thanh toán bằng mã QR mô phỏng ngay trên thiết bị của bạn.</p><div class="steps"><span class="step current">1 · Quét sản phẩm</span><span class="step">2 · Kiểm tra giỏ</span><span class="step">3 · Thanh toán</span></div>${s.sessionStatus === "ACTIVE" ? button("Bắt đầu quét sản phẩm →", "nav('scan')", "primary") : button("Bắt đầu phiên mới →", "newSession()", "primary")}</section><section class="panel"><h2>Phiên mua sắm</h2><p class="muted small">Phiên hiện tại: #SC-${String(s.session).padStart(4, "0")}</p><div class="stat"><div class="muted small">Sản phẩm trong giỏ</div><div class="num">${count()}</div><p class="muted small">Tạm tính: ${format(total())}</p></div><div class="divider"></div><p class="muted small">Bạn có thể nhập mã thủ công khi camera không khả dụng.</p>${button("Xem giỏ hàng", "nav('cart')", "secondary")}</section></div>`;
}
function lookup() {
  if (!readAvailable()) return;
  const value = document.getElementById("barcode")?.value.trim() || "";
  s.query = value;
  if (!value || value.length > 64) {
    s.formError = "Nhập barcode hoặc SKU từ 1 đến 64 ký tự.";
    s.lookup = null;
    render("barcode");
    return;
  }
  const product = s.products.find(
    (p) => p.sku.toLowerCase() === value.toLowerCase() || p.barcode === value,
  );
  s.formError = "";
  s.lookup = product ? { id: product.id } : { missing: value };
  render(product ? "lookup-result" : "barcode");
}
function addItem(id) {
  if (!canEditCart()) return;
  const product = pById(id);
  if (!product?.active || product.stock <= (s.cart[id] || 0)) {
    toast("Sản phẩm đã ngừng bán, hết hàng hoặc không đủ tồn kho.", "bad");
    return;
  }
  s.cart[id] = (s.cart[id] || 0) + 1;
  s.lookup = null;
  toast(`Đã thêm ${product.name} vào giỏ hàng.`);
}
function scan() {
  let result = s.lookup?.id
    ? (() => {
        let p = pById(s.lookup.id);
        return `<div id="lookup-result" tabindex="-1" class="panel tight" style="margin-top:var(--space-4)"><div class="row"><span class="producticon">${p.emoji}</span><div><b>${esc(p.name)}</b><div class="small muted">${esc(p.sku)} · ${esc(p.barcode)}</div></div></div><div class="row between" style="margin-top:var(--space-3)"><b>${format(p.price)}</b>${button("Thêm vào giỏ", `addItem(${p.id})`, "primary")}</div></div>`;
      })()
    : s.lookup?.missing
      ? `<div class="notice bad" role="alert">Không tìm thấy sản phẩm với mã “${esc(s.lookup.missing)}”. Kiểm tra lại mã hoặc nhờ nhân viên hỗ trợ.</div>`
      : "";
  return `<div class="steps"><span class="step current">1 · Quét sản phẩm</span><span class="step">2 · Kiểm tra giỏ</span><span class="step">3 · Thanh toán</span></div><div class="grid two"><section class="panel"><h2>Quét mã qua camera</h2><div class="scanbox"><div class="scanicon">▣</div><b>Đưa mã vạch vào khung quét</b><p class="muted small">Bản demo chưa kết nối camera thực tế.</p></div><p class="small muted" style="margin-top:var(--space-3)">Hệ thống thực tế cần HTTPS, quyền camera và thiết bị hỗ trợ.</p></section><section class="panel"><h2>Nhập mã thủ công</h2><div class="field"><label for="barcode">Barcode hoặc SKU</label><input id="barcode" placeholder="Ví dụ: MILK001" value="${esc(s.query)}" oninput="s.query=this.value" onkeydown="if(event.key==='Enter')lookup()"><small>Thử: MILK001, BREAD002, WATER003, COFFEE004, NOODLE005</small>${s.formError ? `<span class="errorfield" role="alert">⚠ ${esc(s.formError)}</span>` : ""}</div>${button("Tra cứu sản phẩm", "lookup()", s.lookup?.id ? "secondary" : "primary")}${result}<div class="divider"></div><div class="row between"><span class="muted">Giỏ hàng: ${count()} sản phẩm</span>${button("Xem giỏ hàng →", "nav('cart')", "secondary")}</div></section></div>`;
}
function setQty(id, delta) {
  if (!canEditCart()) return;
  const quantity = (s.cart[id] || 0) + delta;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    toast("Số lượng tối thiểu là 1. Chọn Xóa nếu không muốn mua.", "warn");
    return;
  }
  if (!pById(id)?.active || quantity > pById(id).stock) {
    toast("Sản phẩm không khả dụng hoặc không đủ tồn kho.", "warn");
    return;
  }
  s.cart[id] = quantity;
  render();
}
function removeItem(id) {
  if (!canEditCart() || !s.cart[id]) return;
  openDialog({
    title: "Xóa sản phẩm khỏi giỏ?",
    text: `Xóa “${pById(id).name}” khỏi giỏ hàng?`,
    confirm: "Xóa sản phẩm",
    action: () => {
      if (!canEditCart()) return;
      delete s.cart[id];
      closeDialog();
      toast("Đã xóa sản phẩm khỏi giỏ.");
    },
  });
}
function cancelSession() {
  if (!canEditCart()) return;
  openDialog({
    title: "Hủy phiên mua hàng?",
    text: "Giỏ hàng sẽ bị bỏ. Phiên này không thể tiếp tục thanh toán.",
    confirm: "Hủy phiên mua hàng",
    action: () => {
      if (!canEditCart()) return;
      s.cart = {};
      s.sessionStatus = "CANCELLED";
      closeDialog();
      nav("home");
      toast("Phiên đã hủy. Không tạo đơn hoặc trừ tồn kho.");
    },
  });
}
function cart() {
  let rows = cartRows();
  return `<div class="steps"><span class="step">1 · Quét sản phẩm</span><span class="step current">2 · Kiểm tra giỏ</span><span class="step">3 · Thanh toán</span></div><div class="grid two"><section class="panel"><div class="row between"><h2>Danh sách sản phẩm (${count()})</h2>${button("+ Quét thêm", "nav('scan')", "secondary")}</div>${rows.length ? rows.map(({ p, qty }) => `<div class="cartline"><div class="producticon">${p.emoji}</div><div><b>${esc(p.name)}</b><div class="small muted">${format(p.price)} / sản phẩm</div><div class="quantity"><button class="qtybtn" data-focus="minus-${p.id}" aria-label="Giảm ${esc(p.name)}" onclick="setQty(${p.id},-1)">−</button><b style="min-width:24px;text-align:center">${qty}</b><button class="qtybtn" data-focus="plus-${p.id}" aria-label="Tăng ${esc(p.name)}" onclick="setQty(${p.id},1)">+</button><button class="link" data-focus="remove-${p.id}" onclick="removeItem(${p.id})">Xóa</button></div></div><b>${format(p.price * qty)}</b></div>`).join("") : `<div class="empty"><div style="font-size:42px">🛒</div><b>Giỏ hàng đang trống</b><p>Quét hoặc nhập mã sản phẩm để bắt đầu mua sắm.</p>${button("Thêm sản phẩm", "nav('scan')", "secondary")}</div>`}</section><section class="panel"><h2>Tóm tắt đơn hàng</h2><div class="row between"><span>Số lượng sản phẩm</span><b>${count()}</b></div><div class="total"><span>Tổng thanh toán</span><span>${format(total())}</span></div><p class="muted small" style="margin-top:var(--space-4)">Thanh toán thử nghiệm qua cổng mô phỏng, không sử dụng tiền thật.</p>${button(locked() ? "Theo dõi thanh toán →" : "Tiếp tục thanh toán →", "nav('payment')", "primary", rows.length || locked() ? "" : 'disabled title="Giỏ hàng đang trống"')}<div class="divider"></div>${button("Hủy phiên mua hàng", "cancelSession()", "danger")}</section></div>`;
}
function startPayment() {
  if (!canEditCart()) return;
  const items = cartRows().map(({ p, qty }) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    unit_price: p.price,
    qty,
  }));
  if (
    !items.length ||
    items.some(
      (x) =>
        !Number.isSafeInteger(x.qty) ||
        x.qty <= 0 ||
        !pById(x.id).active ||
        pById(x.id).stock < x.qty,
    )
  ) {
    toast(
      "Giỏ trống hoặc sản phẩm không còn khả dụng. Hãy kiểm tra lại giỏ.",
      "bad",
    );
    return;
  }
  const amount = items.reduce((sum, x) => sum + x.unit_price * x.qty, 0);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    toast("Tổng tiền không hợp lệ.", "bad");
    return;
  }
  s.transaction++;
  s.paymentSnapshot = {
    items,
    amount,
    currency: "VND",
    session: s.session,
    transaction: s.transaction,
    createdAt: new Date().toISOString(),
  };
  s.attempts.push({ ...structuredClone(s.paymentSnapshot), status: "PENDING" });
  s.payment = "PENDING";
  render();
}
function paymentResult(which) {
  if (
    s.role !== "customer" ||
    !readAvailable() ||
    !locked() ||
    !s.paymentSnapshot
  )
    return;
  const attempt = s.attempts.find((x) => x.transaction === s.transaction);
  if (!attempt) return;
  if (which === "success") {
    const snapshot = s.paymentSnapshot;
    if (s.orders.some((x) => x.transaction === snapshot.transaction)) return;
    if (
      !snapshot.items.length ||
      snapshot.items.some((x) => !pById(x.id) || pById(x.id).stock < x.qty)
    ) {
      s.payment = "UNKNOWN";
      attempt.status = "UNKNOWN";
      attempt.needsReview = true;
      toast(
        "Chưa thể hoàn tất đơn do tồn kho thay đổi. Giữ giao dịch để đối soát; không tạo thanh toán mới.",
        "warn",
      );
      return;
    }
    // Synchronous demo commit only. Production requires a PostgreSQL transaction.
    const order = {
      id: s.orders.length + 1,
      transaction: snapshot.transaction,
      session: snapshot.session,
      amount: snapshot.amount,
      currency: snapshot.currency,
      items: structuredClone(snapshot.items),
      createdAt: new Date().toISOString(),
    };
    snapshot.items.forEach((x) => {
      pById(x.id).stock -= x.qty;
    });
    s.orders.push(order);
    s.payment = "SUCCESS";
    attempt.status = "SUCCESS";
    s.sessionStatus = "COMPLETED";
    s.page = "receipt";
    writeRoute();
    toast("Thanh toán mô phỏng thành công. Đơn hàng đã hoàn tất.");
  } else if (which === "failed") {
    s.payment = "FAILED";
    attempt.status = "FAILED";
    toast(
      "Giao dịch mô phỏng đã xác nhận thất bại. Bạn có thể sửa giỏ hoặc thử lại.",
      "bad",
    );
  } else {
    s.payment = "UNKNOWN";
    attempt.status = "UNKNOWN";
    toast(
      "Chưa rõ kết quả. Giữ nguyên giao dịch; không sửa giỏ hoặc thanh toán lại.",
      "warn",
    );
  }
}
function qr() {
  let k = 53 + s.transaction;
  return `<div class="qr" role="img" aria-label="Mã QR minh họa, không thể thanh toán thật">${Array.from(
    { length: 121 },
    (_, i) => {
      let x = i % 11,
        y = Math.floor(i / 11);
      let finder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
      return `<i class="${finder || (i * 17 + k * 11 + i * i) % 7 < 3 ? "on" : ""}"></i>`;
    },
  ).join("")}</div>`;
}
function payment() {
  if (s.sessionStatus === "COMPLETED")
    return `<section class="panel"><h2>Phiên đã hoàn tất</h2>${button("Xem xác nhận", "nav('receipt')", "primary")}</section>`;
  if (s.sessionStatus === "CANCELLED")
    return `<section class="panel"><h2>Phiên đã hủy</h2>${button("Bắt đầu phiên mới", "newSession()", "primary")}</section>`;
  const items = hasPaymentSnapshot()
    ? s.paymentSnapshot.items
    : cartRows().map(({ p, qty }) => ({
        name: p.name,
        unit_price: p.price,
        qty,
      }));
  return `<div class="grid two"><section class="panel"><h2>${locked() ? "Theo dõi giao dịch" : "Xác nhận thanh toán"}</h2>
    ${
      locked()
        ? `<p class="notice ${s.payment === "UNKNOWN" ? "warn" : ""}" role="status">${s.payment === "UNKNOWN" ? "Chưa rõ kết quả. Không thanh toán lại hoặc sửa giỏ." : "Đang chờ kết quả thanh toán."}</p>
      <p>Mã giao dịch: <b>TX-${s.transaction}</b></p>${qr()}<p class="small muted">QR minh họa; không thể chuyển tiền thật.</p>
      ${button("Kiểm tra trạng thái", "toast('Giao dịch vẫn '+statusLabel(s.payment)+'. Dùng công cụ mô phỏng để thử kết quả; không tạo giao dịch mới.','warn')", "primary")}
      <details class="demo-tools"><summary>Công cụ giả lập kết quả (dành cho người thử)</summary><div class="row">
      ${button("Mô phỏng thành công", "paymentResult('success')", "secondary")}${button("Mô phỏng thất bại", "paymentResult('failed')", "secondary")}${button("Mô phỏng timeout", "paymentResult('unknown')", "secondary")}</div></details>`
        : `<p>Kiểm tra tổng tiền. Khi tạo giao dịch, tên hàng, giá và số lượng được chốt; giỏ tạm khóa.</p>${s.payment === "FAILED" ? '<p class="notice bad">Giao dịch trước đã xác nhận thất bại. Bạn có thể thử lại.</p>' : ""}
      ${button("Tạo mã thanh toán mô phỏng", "startPayment()", "primary", items.length ? "" : "disabled")}<p class="small muted">${items.length ? "Không sử dụng tiền thật." : "Giỏ hàng đang trống; thêm sản phẩm trước khi thanh toán."}</p>`
    }
      <button class="link" onclick="nav('cart')">← Quay lại giỏ hàng</button></section>
    <section class="panel"><h2>Chi tiết thanh toán</h2>${items.map((x) => `<div class="row between"><span>${esc(x.name)} × ${x.qty}</span><b>${format(x.unit_price * x.qty)}</b></div>`).join("")}
    <div class="total"><span>Tổng cộng</span><span>${format(total())}</span></div></section></div>`;
}
function receipt() {
  const order = s.orders.find((x) => x.session === s.session);
  if (!order)
    return `<section class="panel empty"><h2>Chưa có xác nhận cho phiên này</h2><p>Chỉ giao dịch được xác nhận thành công mới có đơn hàng.</p>${button("Kiểm tra thanh toán", "nav('payment')", "primary")}</section>`;
  return `<section class="panel receipt"><h2>Thanh toán thành công</h2><p>Xác nhận giao dịch mô phỏng, không phải hóa đơn điện tử pháp lý.</p>
    <p>Mã đơn: <b>ORD-${order.id}</b> · Mã giao dịch: <b>TX-${order.transaction}</b></p><p>${esc(new Date(order.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))}</p>
    ${order.items.map((x) => `<div class="row between"><span>${esc(x.name)} × ${x.qty}</span><b>${format(x.qty * x.unit_price)}</b></div>`).join("")}
    <div class="total"><span>Đã thanh toán</span><span>${format(order.amount)}</span></div>
    ${button("Bắt đầu phiên mua mới", "newSession()", "primary")}</section>`;
}
function newSession() {
  if (s.role !== "customer" || !readAvailable()) return;
  if (locked()) {
    toast("Giao dịch chưa rõ kết quả. Không thể mở phiên mới.", "warn");
    return;
  }
  if (s.sessionStatus === "ACTIVE" && count()) {
    toast("Hãy hoàn tất hoặc hủy phiên hiện tại trước.", "warn");
    return;
  }
  s.session++;
  s.cart = {};
  s.payment = "NONE";
  s.paymentSnapshot = null;
  s.sessionStatus = "ACTIVE";
  s.lookup = null;
  s.query = "";
  nav("scan");
}
function sessions() {
  const currentItems = hasPaymentSnapshot()
    ? s.paymentSnapshot.items
    : cartRows().map(({ p, qty }) => ({
        name: p.name,
        sku: p.sku,
        unit_price: p.price,
        qty,
      }));
  const sessions = [
    {
      id: `SC-${String(s.session).padStart(4, "0")}`,
      status: s.sessionStatus,
      payment: s.payment,
      items: currentItems,
    },
    {
      id: "SC-MAU-02",
      status: "ACTIVE",
      payment: "NONE",
      items: [
        { name: "Nước suối 500ml", sku: "WATER003", unit_price: 9000, qty: 3 },
      ],
    },
    {
      id: "SC-MAU-03",
      status: "ACTIVE",
      payment: "PENDING",
      items: [
        {
          name: "Bánh mì sandwich",
          sku: "BREAD002",
          unit_price: 28000,
          qty: 2,
        },
      ],
    },
  ];
  const selected = sessions[s.staffSelected] || sessions[0];
  return `<div class="grid two"><section class="panel"><h2>Danh sách phiên</h2><p class="small muted">Hai phiên SC-MAU là dữ liệu minh họa cố định.</p>
    <div class="tablewrap" role="region" aria-label="Danh sách phiên" tabindex="0"><table><thead><tr><th>Mã phiên</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    ${sessions.map((x, i) => `<tr><td>${esc(x.id)}</td><td>${statusLabel(x.status)}</td><td><button class="link" onclick="selectSession(${i})" aria-pressed="${selected.id === x.id}">Xem ${esc(x.id)}</button></td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><h2 id="session-detail" tabindex="-1">Chi tiết ${esc(selected.id)}</h2><p class="muted">Chỉ xem; không sửa giỏ hoặc xác nhận thanh toán.</p>
    <p>Phiên: <b>${statusLabel(selected.status)}</b> · Thanh toán: <b>${statusLabel(selected.payment)}</b></p>
    ${selected.items.length ? selected.items.map((x) => `<div class="cartline"><div><b>${esc(x.name)}</b><div class="small muted">${esc(x.sku)}</div></div><span>${x.qty} × ${format(x.unit_price)}</span><b>${format(x.qty * x.unit_price)}</b></div>`).join("") : "<p>Giỏ phiên này chưa có sản phẩm.</p>"}
    <div class="total"><span>Tổng cộng</span><span>${format(selected.items.reduce((sum, x) => sum + x.qty * x.unit_price, 0))}</span></div>
    ${button("Làm mới phiên", "toast('Đã làm mới dữ liệu demo.')", "primary")}</section></div>`;
}
function productTable(mode) {
  let q = s.adminQuery.toLowerCase();
  let list = s.products.filter((x) =>
    [x.name, x.sku, x.barcode].some((v) => v.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(list.length / 20));
  s.pageNumber = Math.min(Math.max(1, s.pageNumber), pages);
  const visible = list.slice((s.pageNumber - 1) * 20, s.pageNumber * 20);
  return `<div class="tablewrap" role="region" aria-label="Danh sách sản phẩm" tabindex="0"><table><thead><tr><th>Sản phẩm</th><th>SKU / Barcode</th><th class="num">${mode === "inventory" ? "Tồn kho" : "Giá bán"}</th><th>Trạng thái</th>${mode === "products" ? "<th>Thao tác</th>" : ""}</tr></thead><tbody>${visible.map((p) => `<tr><td><b>${p.emoji} ${esc(p.name)}</b></td><td><div>${esc(p.sku)}</div><span class="muted small">${esc(p.barcode)}</span></td><td class="num"><b>${mode === "inventory" ? p.stock : format(p.price)}</b></td><td><span class="pill ${p.active ? "good" : "bad"}">${p.active ? "Đang bán" : "Ngừng bán"}</span>${mode === "inventory" && p.stock === 0 ? ' <span class="pill warn">Hết hàng</span>' : ""}</td>${mode === "products" ? `<td><button class="link" onclick="editProduct(${p.id})" aria-label="Chỉnh sửa ${esc(p.name)}">Chỉnh sửa</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="${mode === "products" ? 5 : 4}">Không có sản phẩm phù hợp. Hãy sửa từ khóa tìm kiếm.</td></tr>`}</tbody></table></div>
    <div class="row between"><span>${list.length} kết quả · Trang ${s.pageNumber}/${pages}</span><div class="row">${button("Trang trước", "s.pageNumber--;render()", "secondary", s.pageNumber === 1 ? "disabled" : "")}${button("Trang sau", "s.pageNumber++;render()", "secondary", s.pageNumber === pages ? "disabled" : "")}</div></div>`;
}
function products() {
  return `<section class="panel"><div class="row between" style="margin-bottom:var(--space-4)"><div><h2>Danh sách sản phẩm</h2><p class="muted small">${s.products.length} sản phẩm mẫu</p></div>${button("+ Thêm sản phẩm", "editProduct(null)", "primary")}</div><div class="field" style="max-width:460px"><label for="search">Tìm theo tên, barcode hoặc SKU</label><input id="search" value="${esc(s.adminQuery)}" placeholder="Nhập mã hoặc tên sản phẩm" oninput="s.adminQuery=this.value;s.pageNumber=1;render();document.getElementById('search')?.focus()"></div>${productTable("products")}</section>`;
}
function editProduct(id) {
  if (s.role !== "admin" || !readAvailable()) return;
  if (id !== null && !pById(id)) return;
  s.editId = id;
  const product = pById(id);
  s.draft = product
    ? {
        pn: product.name,
        sku: product.sku,
        bc: product.barcode,
        price: String(product.price),
        stock: String(product.stock),
      }
    : { pn: "", sku: "", bc: "", price: "", stock: "0" };
  s.fieldErrors = {};
  s.formError = "";
  s.page = "productForm";
  writeRoute();
  render("page-title");
}
function productForm() {
  const draft = s.draft || { pn: "", sku: "", bc: "", price: "", stock: "0" };
  const fields = [
    ["pn", "Tên sản phẩm", "text"],
    ["sku", "SKU", "text"],
    ["bc", "Barcode", "text"],
    ["price", "Giá bán (₫)", "number"],
  ];
  if (!s.editId) fields.push(["stock", "Tồn kho mẫu ban đầu", "number"]);
  return `<section class="panel form-panel"><button class="link" onclick="nav('products')">← Quay lại sản phẩm</button>
    <h2>${s.editId ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}</h2>
    <form onsubmit="saveProduct(event)" novalidate>
    ${Object.keys(s.fieldErrors).length ? '<div class="notice bad" role="alert">Chưa lưu được. Sửa các trường được đánh dấu; thông tin đã nhập vẫn được giữ.</div>' : ""}
    ${fields
      .map(
        ([
          id,
          label,
          type,
        ]) => `<div class="field"><label for="${id}">${label}</label>
      <input id="${id}" name="${id}" type="${type}" value="${esc(draft[id])}" required ${type === "number" ? 'min="0" step="1"' : 'maxlength="' + (id === "pn" ? 120 : 64) + '"'}
        oninput="s.draft['${id}']=this.value" aria-invalid="${!!s.fieldErrors[id]}" ${s.fieldErrors[id] ? `aria-describedby="${id}-error"` : ""}>
      ${s.fieldErrors[id] ? `<span class="errorfield" id="${id}-error">${esc(s.fieldErrors[id])}</span>` : ""}</div>`,
      )
      .join("")}
    ${!s.editId ? '<p class="small muted">Tồn ban đầu chỉ tạo dữ liệu mẫu; đây không phải chức năng nhập kho.</p>' : ""}
    <div class="row"><button class="button primary" type="submit">Lưu sản phẩm</button>
    ${button("Hủy chỉnh sửa", "nav('products')", "secondary")}
    ${s.editId && pById(s.editId)?.active ? button("Ngừng kinh doanh", `deactivate(${s.editId})`, "danger") : ""}</div></form></section>`;
}
function saveProduct(event) {
  event.preventDefault();
  if (s.role !== "admin" || !readAvailable()) return;
  const form = new FormData(event.target);
  const draft = Object.fromEntries(
    ["pn", "sku", "bc", "price", "stock"].map((key) => [
      key,
      String(form.get(key) ?? s.draft?.[key] ?? ""),
    ]),
  );
  s.draft = draft;
  s.fieldErrors = {};
  const name = draft.pn.trim(),
    sku = draft.sku.trim(),
    barcode = draft.bc.trim();
  const price = Number(draft.price),
    stock = Number(draft.stock);
  if (!name || name.length > 120)
    s.fieldErrors.pn = "Nhập tên từ 1 đến 120 ký tự.";
  if (!sku || sku.length > 64)
    s.fieldErrors.sku = "Nhập SKU từ 1 đến 64 ký tự.";
  if (!barcode || barcode.length > 64)
    s.fieldErrors.bc = "Nhập barcode từ 1 đến 64 ký tự.";
  if (!draft.price.trim() || !Number.isSafeInteger(price) || price < 0)
    s.fieldErrors.price = "Giá phải là số nguyên không âm.";
  if (
    !s.editId &&
    (!draft.stock.trim() || !Number.isSafeInteger(stock) || stock < 0)
  )
    s.fieldErrors.stock = "Tồn mẫu phải là số nguyên không âm.";
  if (
    s.products.some(
      (p) => p.id !== s.editId && p.sku.toLowerCase() === sku.toLowerCase(),
    )
  )
    s.fieldErrors.sku = "SKU đã được sử dụng. Nhập mã khác.";
  if (s.products.some((p) => p.id !== s.editId && p.barcode === barcode))
    s.fieldErrors.bc = "Barcode đã được sử dụng. Nhập mã khác.";
  if (Object.keys(s.fieldErrors).length) {
    render(Object.keys(s.fieldErrors)[0]);
    return;
  }
  if (s.editId) Object.assign(pById(s.editId), { name, sku, barcode, price });
  else
    s.products.push({
      id: Math.max(0, ...s.products.map((x) => x.id)) + 1,
      name,
      sku,
      barcode,
      price,
      stock,
      emoji: "📦",
      active: true,
    });
  s.draft = null;
  s.editId = null;
  nav("products");
  toast("Đã lưu sản phẩm trong dữ liệu demo.");
}
function deactivate(id) {
  if (s.role !== "admin" || !readAvailable() || !pById(id)) return;
  openDialog({
    title: "Ngừng kinh doanh sản phẩm?",
    text: `“${pById(id).name}” sẽ không được thêm mới vào giỏ. Lịch sử đơn hàng vẫn giữ nguyên.`,
    confirm: "Ngừng kinh doanh",
    action: () => {
      if (s.role !== "admin" || !readAvailable()) return;
      pById(id).active = false;
      closeDialog();
      nav("products");
      toast("Đã ngừng kinh doanh sản phẩm.");
    },
  });
}
function inventory() {
  return `<section class="panel"><h2>Tồn kho hiện tại</h2><p class="muted small">Số lượng theo dữ liệu mô phỏng, chỉ được xem trong màn hình này.</p><div class="field" style="max-width:460px"><label for="search">Tra cứu barcode / SKU / tên</label><input id="search" value="${esc(s.adminQuery)}" oninput="s.adminQuery=this.value;s.pageNumber=1;render();document.getElementById('search')?.focus()"></div>${button("Tìm sản phẩm", "render()", "primary")}${productTable("inventory")}</section>`;
}
function reports() {
  const start = s.dateStart,
    end = s.dateEnd;
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    start <= end;
  const inRange = (x) => {
    const day = localDate(x.createdAt);
    return day >= start && day <= end;
  };
  const orders = valid ? s.orders.filter(inRange) : [];
  const attempts = valid ? s.attempts.filter(inRange) : [];
  return `<section class="panel"><h2>Lọc thời gian</h2><p class="small muted">Theo ngày tại Việt Nam (Asia/Ho_Chi_Minh), gồm cả ngày kết thúc.</p><div class="row">
    <div class="field"><label for="d1">Từ ngày</label><input type="date" id="d1" value="${esc(start)}" onchange="s.dateStart=this.value"></div>
    <div class="field"><label for="d2">Đến ngày</label><input type="date" id="d2" value="${esc(end)}" onchange="s.dateEnd=this.value"></div>
    ${button("Xem báo cáo", "render()", "primary")}</div>
    ${!valid ? '<p class="notice bad" role="alert">Chọn đủ ngày bắt đầu và kết thúc; ngày bắt đầu không được sau ngày kết thúc.</p>' : ""}</section>
    ${
      valid
        ? `<section class="panel report-result"><h2>Kết quả trong kỳ</h2><p>Doanh thu đơn hoàn tất: <b>${format(orders.reduce((sum, x) => sum + x.amount, 0))}</b> · ${orders.length} đơn</p>
      <div class="grid three">${["PENDING", "UNKNOWN", "FAILED", "SUCCESS"].map((state) => `<div class="stat"><span>${statusLabel(state)}</span><div class="num">${attempts.filter((x) => x.status === state).length}</div></div>`).join("")}</div>
      <p class="small muted">Đếm theo trạng thái hiện tại của giao dịch được tạo trong kỳ. Doanh thu theo ngày hoàn tất đơn; callback lặp không tạo thêm đơn.</p>
      ${orders.length ? orders.map((o) => `<p>ORD-${o.id}: <b>${format(o.amount)}</b></p>`).join("") : "<p>Không có đơn hoàn tất trong kỳ. Doanh thu bằng 0, không bao gồm giao dịch đang chờ hoặc thất bại.</p>"}</section>`
        : ""
    }`;
}
function modal() {
  if (!s.dialog) return "";
  return `<div class="overlay"><section class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-desc">
    <h2 id="dialog-title">${esc(s.dialog.title)}</h2><p id="dialog-desc">${esc(s.dialog.text)}</p><div class="actions">
    ${button("Giữ nguyên", "closeDialog()", "secondary", 'id="dialog-cancel"')}${button(esc(s.dialog.confirm), "confirmDialog()", "danger", 'id="dialog-confirm"')}</div></section></div>`;
}

// Browser-only prototype infrastructure. None of these checks replace server authorization.
const STORAGE_KEY = "smart-checkout-prototype-v2";
const persistedKeys = [
  "cart",
  "products",
  "session",
  "sessionStatus",
  "payment",
  "transaction",
  "orders",
  "attempts",
  "paymentSnapshot",
];
let storageWarning = "";
let dialogReturnFocus = null;
let cameraStream = null;
let cameraTimer = null;
let cameraGeneration = 0;
let cameraMessage = "Chọn Bật camera hoặc nhập mã thủ công.";
function hasPaymentSnapshot() {
  return (
    !!s.paymentSnapshot && ["PENDING", "UNKNOWN", "SUCCESS"].includes(s.payment)
  );
}
function locked() {
  return ["PENDING", "UNKNOWN"].includes(s.payment);
}
function localDate(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function statusLabel(status) {
  return (
    {
      ACTIVE: "Đang hoạt động",
      COMPLETED: "Đã hoàn tất",
      CANCELLED: "Đã hủy",
      NONE: "Chưa thanh toán",
      PENDING: "Đang chờ",
      UNKNOWN: "Chưa xác định",
      FAILED: "Thất bại",
      SUCCESS: "Thành công",
    }[status] || "Chưa xác định"
  );
}
function readAvailable() {
  if (s.dataState !== "normal" || !navigator.onLine) {
    toast(
      "Dữ liệu chưa sẵn sàng hoặc đang ngoại tuyến. Khôi phục kết nối và thử lại.",
      "warn",
    );
    return false;
  }
  return true;
}
function canEditCart() {
  if (s.role !== "customer" || !readAvailable()) return false;
  if (locked()) {
    toast("Giao dịch chưa xác định. Không thể sửa hoặc hủy giỏ hàng.", "warn");
    return false;
  }
  if (s.sessionStatus !== "ACTIVE") {
    toast("Phiên đã kết thúc. Hãy bắt đầu phiên mới.", "warn");
    return false;
  }
  return true;
}
function saveDemo() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        ...Object.fromEntries(persistedKeys.map((key) => [key, s[key]])),
      }),
    );
  } catch {
    storageWarning =
      "Trình duyệt không lưu được phiên demo. Đừng tải lại hoặc đóng tab khi giao dịch chưa rõ kết quả.";
  }
}
function restoreDemo() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (
      data.version !== 2 ||
      !Array.isArray(data.products) ||
      !data.products.length ||
      !Array.isArray(data.orders) ||
      !Array.isArray(data.attempts) ||
      !data.cart ||
      !Number.isSafeInteger(data.session) ||
      !Number.isSafeInteger(data.transaction) ||
      !["ACTIVE", "COMPLETED", "CANCELLED"].includes(data.sessionStatus) ||
      !["NONE", "PENDING", "UNKNOWN", "FAILED", "SUCCESS"].includes(
        data.payment,
      )
    )
      throw new Error("Invalid demo state");
    if (
      data.products.some(
        (p) =>
          !Number.isSafeInteger(p.id) ||
          !Number.isSafeInteger(p.price) ||
          p.price < 0 ||
          !Number.isSafeInteger(p.stock) ||
          p.stock < 0 ||
          typeof p.name !== "string" ||
          typeof p.sku !== "string" ||
          typeof p.barcode !== "string",
      )
    )
      throw new Error("Invalid products");
    if (
      Object.entries(data.cart).some(
        ([id, qty]) =>
          !data.products.some((p) => p.id === Number(id)) ||
          !Number.isSafeInteger(qty) ||
          qty <= 0,
      )
    )
      throw new Error("Invalid cart");
    if (
      ["PENDING", "UNKNOWN"].includes(data.payment) &&
      (!data.paymentSnapshot ||
        !data.attempts.some((a) => a.transaction === data.transaction))
    )
      throw new Error("Missing payment");
    persistedKeys.forEach((key) => {
      s[key] = data[key];
    });
  } catch {
    storageWarning =
      "Không thể khôi phục dữ liệu demo đã lưu. Không dùng dữ liệu này để xác nhận một giao dịch trước đó.";
    // Do not silently replace an unresolved attempt with a new editable cart.
    s.payment = "UNKNOWN";
    s.sessionStatus = "ACTIVE";
  }
}
const routes = {
  home: "home",
  scan: "scan",
  cart: "cart",
  payment: "payment",
  receipt: "receipt",
  sessions: "sessions",
  products: "products",
  inventory: "inventory",
  reports: "reports",
};
function allowedPage(page) {
  return s.role === "customer"
    ? ["home", "scan", "cart", "payment", "receipt"].includes(page)
    : s.role === "staff"
      ? page === "sessions"
      : [
          "products",
          "productForm",
          "inventory",
          "reports",
          "sessions",
        ].includes(page);
}
function writeRoute(replace = false) {
  const segment =
    s.page === "productForm" ? `products/${s.editId || "new"}` : routes[s.page];
  const hash = `#/${s.role}/${segment}`;
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
}
function readRoute() {
  stopCamera();
  const parts = location.hash.replace(/^#\//, "").split("/");
  if (menus[parts[0]]) s.role = parts[0];
  s.page =
    Object.keys(routes).find((page) => routes[page] === parts[1]) ||
    menus[s.role][0][0];
  if (s.role === "admin" && parts[1] === "products" && parts[2]) {
    const id = parts[2] === "new" ? null : Number(parts[2]);
    if (id === null || pById(id)) {
      const p = pById(id);
      s.editId = id;
      s.page = "productForm";
      s.draft = p
        ? {
            pn: p.name,
            sku: p.sku,
            bc: p.barcode,
            price: String(p.price),
            stock: String(p.stock),
          }
        : { pn: "", sku: "", bc: "", price: "", stock: "0" };
    }
  }
  if (!allowedPage(s.page)) s.page = menus[s.role][0][0];
  s.dialog = null;
  s.fieldErrors = {};
  s.formError = "";
  s.dataState = "normal";
  s.alert = null;
  writeRoute(true);
  render("page-title");
}
function focusKey(element) {
  return element?.id
    ? { id: element.id }
    : element?.dataset?.focus
      ? { data: element.dataset.focus }
      : null;
}
function restoreFocus(key) {
  if (!key) return false;
  const element = key.id
    ? document.getElementById(key.id)
    : document.querySelector(`[data-focus="${CSS.escape(key.data)}"]`);
  if (!element || element.disabled || element.closest("[inert]")) return false;
  element.focus();
  return true;
}
function openDialog(dialog) {
  dialogReturnFocus = focusKey(document.activeElement);
  s.dialog = dialog;
  render("dialog-cancel");
}
function closeDialog() {
  const target = dialogReturnFocus;
  s.dialog = null;
  render();
  if (!restoreFocus(target)) document.getElementById("page-title")?.focus();
  dialogReturnFocus = null;
}
function confirmDialog() {
  s.dialog?.action();
}
function selectSession(index) {
  s.staffSelected = index;
  render("session-detail");
}
function demoState() {
  return `<details class="demo-tools"><summary>Công cụ thử trạng thái giao diện</summary><label for="demo-state">Trạng thái trang (không thay đổi dữ liệu nghiệp vụ)</label>
    <select id="demo-state" onchange="s.dataState=this.value;stopCamera();render()">${[
      ["normal", "Bình thường"],
      ["loading", "Đang tải"],
      ["empty", "Trống"],
      ["error", "Lỗi tải dữ liệu"],
      ["partial", "Ngoại tuyến / dữ liệu cũ"],
      ["success", "Phản hồi thành công"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${s.dataState === value ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></details>`;
}
function gateData(content) {
  const info = {
    home: ["Chưa có phiên để hiển thị.", "Bắt đầu phiên"],
    scan: ["Chưa có kết quả tra cứu.", "Nhập mã sản phẩm"],
    cart: ["Giỏ hàng chưa có sản phẩm.", "Thêm sản phẩm"],
    payment: ["Chưa có giao dịch thanh toán.", "Kiểm tra giỏ"],
    receipt: ["Chưa có đơn hoàn tất cho phiên này.", "Kiểm tra thanh toán"],
    sessions: ["Không có phiên trong danh sách.", "Làm mới"],
    products: ["Chưa có sản phẩm.", "Thêm sản phẩm"],
    productForm: ["Chưa có dữ liệu sản phẩm.", "Nhập thông tin"],
    inventory: ["Chưa có dữ liệu tồn kho.", "Làm mới"],
    reports: ["Không có giao dịch trong kỳ. Doanh thu bằng 0.", "Đổi bộ lọc"],
  };
  if (s.dataState === "loading")
    return (
      '<section class="panel" role="status" aria-label="Đang tải dữ liệu"><p>Đang tải dữ liệu…</p>' +
      [1, 2, 3]
        .map(() => '<div class="skeleton" aria-hidden="true"></div>')
        .join("") +
      "</section>"
    );
  if (s.dataState === "error")
    return `<section class="panel"><h2>Chưa tải được dữ liệu</h2><p role="alert">Không thể cập nhật trang. Kiểm tra kết nối hoặc thử lại; giỏ và giao dịch được giữ nguyên.</p>${button("Thử lại", "s.dataState='normal';render()", "primary")}</section>`;
  if (s.dataState === "empty")
    return `<section class="panel empty"><h2>${info[s.page][0]}</h2><p>Đây là tình huống trống mô phỏng; dữ liệu thật trong phiên không bị xóa.</p>${button(info[s.page][1], "s.dataState='normal';render()", "primary")}</section>`;
  return `${s.dataState === "success" ? '<p class="notice good" role="status">Thao tác thành công (phản hồi minh họa, không xác nhận thanh toán).</p>' : ""}
    ${s.dataState === "partial" || !navigator.onLine ? '<p class="notice warn" role="status">Dữ liệu cũ, chưa thể xác nhận cập nhật. Bạn chỉ có thể xem; các thao tác ghi tạm khóa.</p>' : ""}
    <div id="page-content">${content}</div>`;
}
function stopCamera() {
  cameraGeneration++;
  if (cameraTimer) clearTimeout(cameraTimer);
  cameraTimer = null;
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
}
async function startCamera() {
  if (s.role !== "customer" || !readAvailable()) return;
  stopCamera();
  if (
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia ||
    !window.BarcodeDetector
  ) {
    cameraMessage =
      "Trình duyệt chưa hỗ trợ quét camera ở đây. Dùng HTTPS/localhost và trình duyệt hỗ trợ, hoặc nhập mã bên cạnh.";
    render("barcode");
    return;
  }
  const generation = cameraGeneration;
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    if (generation !== cameraGeneration) return;
    const supported = [
      "ean_13",
      "ean_8",
      "code_128",
      "code_39",
      "upc_a",
      "upc_e",
    ].filter((x) => formats.includes(x));
    if (!supported.length) throw new Error("Unsupported formats");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    if (generation !== cameraGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream = stream;
    const video = document.getElementById("camera-preview");
    video.srcObject = stream;
    await video.play();
    if (generation !== cameraGeneration) return;
    cameraMessage =
      "Camera đang bật. Mỗi lần đọc một mã, camera dừng để bạn kiểm tra trước khi thêm.";
    document.getElementById("camera-message").textContent = cameraMessage;
    const detector = new BarcodeDetector({ formats: supported });
    async function detect() {
      if (generation !== cameraGeneration) return;
      try {
        const results = await detector.detect(video);
        if (generation !== cameraGeneration) return;
        if (results[0]?.rawValue) {
          const value = results[0].rawValue;
          stopCamera();
          s.query = value;
          document.getElementById("barcode").value = value;
          lookup();
          return;
        }
        cameraTimer = setTimeout(detect, 300);
      } catch {
        stopCamera();
        cameraMessage = "Không đọc được camera. Hãy nhập mã thủ công.";
        render("barcode");
      }
    }
    cameraTimer = setTimeout(detect, 300);
  } catch {
    if (generation !== cameraGeneration) return;
    stopCamera();
    cameraMessage =
      "Không mở được camera hoặc quyền truy cập bị từ chối. Kiểm tra quyền trình duyệt hoặc nhập mã thủ công.";
    render("barcode");
  }
}
function render(focusId) {
  const focused = focusKey(document.activeElement);
  const selection =
    document.activeElement?.tagName === "INPUT"
      ? {
          start: document.activeElement.selectionStart,
          end: document.activeElement.selectionEnd,
        }
      : null;
  const pages = {
    home,
    scan,
    cart,
    payment,
    receipt,
    sessions,
    products,
    productForm,
    inventory,
    reports,
  };
  stopCamera();
  document.title = (title[s.page] || "Smart Self-Checkout") + " — Prototype";
  document.getElementById("app").innerHTML =
    `<div class="app"><div id="app-shell" ${s.dialog ? "inert" : ""}>
    <a class="skip-link" href="#main" onclick="event.preventDefault();document.getElementById('main').focus()">Đến nội dung chính</a>
    ${header()}<div class="layout">${menu()}<main id="main" tabindex="-1">${heading()}${statusBox()}
    ${storageWarning ? `<p class="notice warn" role="status">${esc(storageWarning)}</p>` : ""}
    ${locked() && s.role === "customer" && s.page !== "payment" ? '<p class="notice warn">Giao dịch đang chờ/chưa rõ kết quả. Giỏ bị khóa; vào Thanh toán để kiểm tra.</p>' : ""}
    ${gateData(pages[s.page]())}${demoState()}<footer class="footer">Prototype UI/UX · dữ liệu và thanh toán mô phỏng. Vai trò demo không phải đăng nhập hoặc phân quyền thật.</footer>
    </main></div>${mobileMenu()}</div>${modal()}</div>`;
  document.querySelector("h1")?.setAttribute("id", "page-title");
  document.getElementById("page-title")?.setAttribute("tabindex", "-1");
  document
    .querySelector("aside nav")
    ?.setAttribute("aria-label", "Điều hướng chính");
  document
    .querySelector(".mobile-nav")
    ?.setAttribute("aria-label", "Điều hướng trên điện thoại");
  document
    .querySelectorAll(".navbtn.active,.mobile-nav button.active")
    .forEach((el) => el.setAttribute("aria-current", "page"));
  document
    .querySelectorAll(".navbtn,.mobile-nav button")
    .forEach((el, index) => (el.dataset.focus = `nav-${index}`));
  document.querySelectorAll("button").forEach((el, index) => {
    if (!el.id && !el.dataset.focus)
      el.dataset.focus = `action-${s.page}-${index}`;
  });
  document.querySelectorAll("input:not([type=number]),select").forEach((el) => {
    if (!el.id) el.id = `field-${s.page}`;
  });
  const offline = s.dataState === "partial" || !navigator.onLine;
  if (offline)
    document
      .querySelectorAll(
        "#page-content button,#page-content input,#page-content select",
      )
      .forEach((el) => (el.disabled = true));
  if (locked() || s.sessionStatus !== "ACTIVE")
    document
      .querySelectorAll('.qtybtn,[data-focus^="remove-"]')
      .forEach((el) => {
        el.disabled = true;
        el.title = "Giỏ bị khóa theo trạng thái phiên hoặc thanh toán.";
      });
  const scanbox = document.querySelector(".scanbox");
  if (scanbox)
    scanbox.innerHTML = `<video id="camera-preview" muted playsinline aria-label="Khung xem camera"></video><p id="camera-message" role="status">${esc(cameraMessage)}</p>${button("Bật camera", "startCamera()", "secondary", offline ? "disabled" : "")}`;
  if (s.formError && document.getElementById("barcode")) {
    document.getElementById("barcode").setAttribute("aria-invalid", "true");
    document.querySelector(".errorfield")?.setAttribute("id", "barcode-error");
    document
      .getElementById("barcode")
      .setAttribute("aria-describedby", "barcode-error");
  }
  if (focusId) document.getElementById(focusId)?.focus();
  else if (!s.dialog && restoreFocus(focused)) {
    if (selection && document.activeElement?.type === "text")
      document.activeElement.setSelectionRange(selection.start, selection.end);
  } else if (s.dialog) document.getElementById("dialog-cancel")?.focus();
  else if (focused) document.getElementById("page-title")?.focus();
  saveDemo();
}
document.addEventListener("keydown", (event) => {
  if (!s.dialog) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog();
    return;
  }
  if (event.key === "Tab") {
    const buttons = [
      ...document.querySelectorAll(".dialog button:not(:disabled)"),
    ];
    const first = buttons[0],
      last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
window.addEventListener("popstate", readRoute);
window.addEventListener("hashchange", readRoute);
window.addEventListener("pagehide", stopCamera);
window.addEventListener("offline", () => {
  stopCamera();
  render();
});
window.addEventListener("online", () => render());
restoreDemo();
const today = localDate();
s.dateStart = today.slice(0, 7) + "-01";
s.dateEnd = today;
readRoute();

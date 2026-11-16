import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, money, type Product } from "../api";
import {
  DataError,
  errorText,
  Loading,
  PageTitle,
  Pagination,
  statusText,
  useResource,
  type Confirmation,
} from "../components";
import { navigate } from "../routing";

type ProductList = { items: Product[]; total: number; asOf: string };
export function ProductsPage({
  inventoryOnly,
  offline,
}: {
  inventoryOnly: boolean;
  offline: boolean;
}) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const loader = useCallback(
    () =>
      api<ProductList>(
        `/inventory?page=${page}&search=${encodeURIComponent(search)}`,
      ),
    [page, search],
  );
  const { data, loading, error, reload } = useResource(loader);
  const disabled = offline || loading || !!error;
  return (
    <>
      <PageTitle
        title={inventoryOnly ? "Theo dõi tồn kho" : "Quản lý sản phẩm"}
      >
        <p>
          {data
            ? `Cập nhật lúc ${new Date(data.asOf).toLocaleString("vi-VN")}`
            : "Chưa có lần cập nhật thành công"}
        </p>
      </PageTitle>
      {error && (
        <DataError error={error} stale={!!data} retry={() => void reload()} />
      )}
      <section className="panel">
        <div className="row between">
          <h2>{inventoryOnly ? "Tồn kho hiện tại" : "Danh sách sản phẩm"}</h2>
          <div className="actions">
            {!inventoryOnly && (
              <button
                disabled={disabled}
                onClick={() => navigate("productForm")}
              >
                Thêm sản phẩm
              </button>
            )}
            <button
              className="secondary"
              disabled={offline || loading}
              onClick={() => void reload()}
            >
              Làm mới
            </button>
          </div>
        </div>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(query.trim());
          }}
        >
          <label htmlFor="product-search">Tìm theo tên, barcode hoặc SKU</label>
          <div className="input-action">
            <input
              id="product-search"
              type="search"
              value={query}
              maxLength={200}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="secondary" disabled={offline || loading}>
              Tìm sản phẩm
            </button>
          </div>
        </form>
        {loading && <Loading />}
        {data && (
          <>
            <p className="hint">
              {data.total} kết quả{loading && " · Đang tải dữ liệu mới"}
            </p>
            <div
              className="table-scroll"
              role="region"
              aria-label="Danh sách sản phẩm"
              tabIndex={0}
            >
              <table>
                <caption>
                  {inventoryOnly
                    ? "Số lượng tồn hệ thống ghi nhận"
                    : "Danh mục sản phẩm"}
                </caption>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SKU / Barcode</th>
                    {inventoryOnly ? (
                      <>
                        <th>Tồn</th>
                        <th>Đang giữ</th>
                        <th>Còn bán được</th>
                      </>
                    ) : (
                      <th>Giá bán</th>
                    )}
                    <th>Trạng thái</th>
                    {!inventoryOnly && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td>
                        {p.sku}
                        <small>{p.barcode}</small>
                      </td>
                      {inventoryOnly ? (
                        <>
                          <td>{p.stock?.onHand ?? 0}</td>
                          <td>{p.stock?.reserved ?? 0}</td>
                          <td>
                            {(p.stock?.onHand ?? 0) - (p.stock?.reserved ?? 0)}
                          </td>
                        </>
                      ) : (
                        <td>{money(p.price)}</td>
                      )}
                      <td>
                        <span className="pill">
                          {p.active ? "Đang bán" : "Ngừng bán"}
                        </span>
                        {inventoryOnly &&
                          (p.stock?.onHand ?? 0) - (p.stock?.reserved ?? 0) ===
                            0 && <span className="pill warning">Hết hàng</span>}
                      </td>
                      {!inventoryOnly && (
                        <td>
                          <button
                            className="secondary"
                            disabled={disabled}
                            onClick={() => navigate("productForm", p.id)}
                          >
                            Sửa
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && (
              <p className="empty">
                {search
                  ? "Không có sản phẩm phù hợp. Hãy sửa từ khóa tìm kiếm."
                  : "Chưa có sản phẩm."}
              </p>
            )}
            <Pagination
              page={page}
              hasNext={page * 20 < data.total}
              busy={disabled}
              change={setPage}
            />
          </>
        )}
      </section>
    </>
  );
}

type Draft = {
  name: string;
  sku: string;
  barcode: string;
  price: string;
  active: boolean;
};
const emptyDraft: Draft = {
  name: "",
  sku: "",
  barcode: "",
  price: "",
  active: true,
};
const labels: Record<string, string> = {
  name: "Tên sản phẩm",
  sku: "SKU",
  barcode: "Barcode",
  price: "Giá (đồng)",
  start: "Từ ngày",
  end: "Đến ngày",
};
export function ProductForm({
  id,
  offline,
  confirm,
  notify,
}: {
  id?: string;
  offline: boolean;
  confirm: (value: Confirmation) => void;
  notify: (text: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft),
    [record, setRecord] = useState<Product | null>(null),
    [loading, setLoading] = useState(!!id),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({});
  const errorSummary = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const p = await api<Product>(`/admin/products/${id}`);
      setRecord(p);
      setDraft({
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        price: String(p.price),
        active: !!p.active,
      });
      setFields({});
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const keys = Object.keys(fields);
    if (keys.length > 1) errorSummary.current?.focus();
    else if (keys.length)
      document.getElementById(`product-${keys[0]}`)?.focus();
  }, [fields]);
  async function save(value: Draft) {
    setSaving(true);
    setError("");
    setFields({});
    try {
      await api(`/admin/products${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", {
        ...value,
        name: value.name.trim(),
        sku: value.sku.trim(),
        barcode: value.barcode.trim(),
        price: Number(value.price),
        ...(id ? { version: record?.version } : {}),
      });
      navigate("products");
      notify("Đã lưu sản phẩm.");
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError) {
        const issues = Object.fromEntries(
          e.details
            .filter((x) => labels[x.field])
            .map((x) => [x.field, x.issue]),
        );
        if (e.code === "DUPLICATE_CODE" && !Object.keys(issues).length) {
          issues.sku = "Kiểm tra SKU trùng.";
          issues.barcode = "Kiểm tra barcode trùng.";
        }
        setFields(issues);
      }
    } finally {
      setSaving(false);
    }
  }
  async function submit(value: Draft) {
    if (offline || saving || loading) return;
    const issues: Record<string, string> = {};
    for (const field of ["name", "sku", "barcode"] as const)
      if (
        !value[field].trim() ||
        value[field].trim().length > (field === "name" ? 200 : 64)
      )
        issues[field] =
          `Nhập ${labels[field]} hợp lệ, tối đa ${field === "name" ? 200 : 64} ký tự.`;
    if (
      !value.price.trim() ||
      !Number.isInteger(Number(value.price)) ||
      Number(value.price) < 0 ||
      Number(value.price) > 2_000_000_000
    )
      issues.price = "Giá phải là số nguyên từ 0 đến 2.000.000.000 đồng.";
    setFields(issues);
    if (Object.keys(issues).length) {
      setError("Kiểm tra các trường được đánh dấu.");
      return;
    }
    if (record?.active && !value.active)
      confirm({
        text: `Ngừng kinh doanh “${value.name}”? Lịch sử đơn hàng vẫn được giữ nguyên.`,
        action: () => save(value),
      });
    else await save(value);
  }
  return (
    <>
      <PageTitle title={id ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới"} />
      <button className="secondary back" onClick={() => navigate("products")}>
        ← Danh sách sản phẩm
      </button>
      {loading && <Loading />}
      {error && !Object.keys(fields).length && (
        <DataError error={error} stale={!!record} retry={() => void load()} />
      )}
      {(!id || record) && (
        <section className="panel form-panel">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit(draft);
            }}
          >
            {!!Object.keys(fields).length && (
              <div
                className="banner error error-summary"
                role="alert"
                tabIndex={-1}
                ref={errorSummary}
              >
                <h2>Kiểm tra thông tin sản phẩm</h2>
                <ul>
                  {Object.entries(fields).map(([field, issue]) => (
                    <li key={field}>
                      <a
                        href={`#product-${field}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(`product-${field}`)?.focus();
                        }}
                      >
                        {labels[field]}: {issue}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(["name", "sku", "barcode", "price"] as const).map((field) => (
              <div className="field" key={field}>
                <label htmlFor={`product-${field}`}>{labels[field]}</label>
                <input
                  id={`product-${field}`}
                  name={field}
                  value={draft[field]}
                  onChange={(e) =>
                    setDraft({ ...draft, [field]: e.target.value })
                  }
                  type={field === "price" ? "number" : "text"}
                  min={field === "price" ? 0 : undefined}
                  max={field === "price" ? 2_000_000_000 : undefined}
                  maxLength={field === "name" ? 200 : 64}
                  required
                  aria-invalid={!!fields[field]}
                  aria-describedby={
                    fields[field] ? `${field}-error` : undefined
                  }
                />
                <span id={`${field}-error`} className="field-error">
                  {fields[field]}
                </span>
              </div>
            ))}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              Đang kinh doanh
            </label>
            <p className="hint">
              Tồn kho được quản lý qua dữ liệu demo. Tạo sản phẩm mới khởi tạo
              tồn bằng 0.
            </p>
            <div className="actions">
              <button disabled={offline || loading || saving}>
                {saving ? "Đang lưu…" : "Lưu sản phẩm"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => navigate("products")}
              >
                Đóng form
              </button>
              {id && (
                <button
                  type="button"
                  className="secondary"
                  disabled={offline || saving || loading}
                  onClick={() => void load()}
                >
                  Tải bản mới
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </>
  );
}

type MonitorItem = {
  id: string;
  status: string;
  amount: number;
  items: {
    quantity: number;
    unitPrice: number;
    product: { name: string; sku: string };
  }[];
  payments: { status: string; completion: string }[];
};
export function MonitorPage({ offline }: { offline: boolean }) {
  const [page, setPage] = useState(1),
    [selectedId, setSelectedId] = useState("");
  const loader = useCallback(
    () =>
      api<{ items: MonitorItem[]; asOf: string }>(
        `/monitoring/carts?page=${page}`,
      ),
    [page],
  );
  const { data, error, loading, reload } = useResource(loader);
  const selected =
    data?.items.find((x) => x.id === selectedId) ?? data?.items[0];
  return (
    <>
      <PageTitle title="Giám sát phiên mua">
        <p>
          {data
            ? `Cập nhật lúc ${new Date(data.asOf).toLocaleString("vi-VN")}`
            : "Chưa có lần cập nhật thành công"}
        </p>
      </PageTitle>
      <button
        className="secondary back"
        disabled={offline || loading}
        onClick={() => void reload()}
      >
        Làm mới
      </button>
      {error && (
        <DataError error={error} stale={!!data} retry={() => void reload()} />
      )}
      {loading && <Loading />}
      {data &&
        (data.items.length ? (
          <div className="two-columns">
            <section className="panel">
              <h2>Danh sách phiên</h2>
              <ul className="session-list">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <button
                      className="secondary"
                      aria-pressed={selected?.id === item.id}
                      onClick={() => setSelectedId(item.id)}
                    >
                      Xem {item.id.slice(0, 8)}
                    </button>
                    <span>
                      {statusText[item.status]} ·{" "}
                      {statusText[item.payments[0]?.status] ||
                        "Chưa thanh toán"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {selected && (
              <section className="panel">
                <h2>Chi tiết {selected.id.slice(0, 8)}</h2>
                <p>
                  Phiên: {statusText[selected.status]} ·{" "}
                  {statusText[selected.payments[0]?.status] ||
                    "Chưa thanh toán"}
                </p>
                {selected.payments[0]?.status === "success" &&
                  selected.payments[0].completion !== "completed" && (
                    <p className="banner warning">
                      Đang hoàn tất đơn hoặc cần đối soát; không xác nhận lại
                      thanh toán.
                    </p>
                  )}
                <ul className="receipt-lines">
                  {selected.items.map((item, i) => (
                    <li key={i}>
                      <span>
                        <b>{item.product.name}</b>
                        <small>
                          {item.product.sku} · {item.quantity} ×{" "}
                          {money(item.unitPrice)}
                        </small>
                      </span>
                      <b>{money(item.quantity * item.unitPrice)}</b>
                    </li>
                  ))}
                </ul>
                {!selected.items.length && (
                  <p>Giỏ phiên này chưa có sản phẩm.</p>
                )}
                <div className="total">
                  <span>Tổng cộng</span>
                  <strong>{money(selected.amount)}</strong>
                </div>
                <p className="hint">
                  Chỉ xem · Không sửa giỏ hoặc xác nhận thanh toán
                </p>
              </section>
            )}
          </div>
        ) : (
          <p className="panel empty">Chưa có phiên trong trang này.</p>
        ))}
      {data && (
        <Pagination
          page={page}
          hasNext={data.items.length === 20}
          busy={offline || loading}
          change={setPage}
        />
      )}
    </>
  );
}

type Report = {
  orderCount: number;
  revenue: number;
  paymentCounts: { status: string; count: number }[];
  orders: {
    id: string;
    paymentId: string;
    completedAt: string;
    amount: number;
  }[];
  asOf: string;
  page: number;
};
export const vietnamDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function ReportsPage({ offline }: { offline: boolean }) {
  const [start, setStart] = useState(vietnamDay().slice(0, 7) + "-01"),
    [end, setEnd] = useState(vietnamDay()),
    [data, setData] = useState<Report | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [dateInvalid, setDateInvalid] = useState(false),
    [range, setRange] = useState<{ start: string; end: string } | null>(null);
  async function load(page = 1, dates = range) {
    if (!dates || offline) return;
    setError("");
    setDateInvalid(false);
    setLoading(true);
    try {
      const first = new Date(`${dates.start}T00:00:00+07:00`),
        last = new Date(
          new Date(`${dates.end}T00:00:00+07:00`).getTime() + 86400000,
        );
      if (
        !Number.isFinite(first.getTime()) ||
        !Number.isFinite(last.getTime()) ||
        last <= first ||
        last.getTime() - first.getTime() > 366 * 86400000
      )
        throw new ApiError("INVALID_DATE_RANGE");
      const result = await api<Report>(
        `/reports?start=${encodeURIComponent(first.toISOString())}&end=${encodeURIComponent(last.toISOString())}&page=${page}`,
      );
      setData(result);
      setRange(dates);
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.code === "INVALID_DATE_RANGE") {
        setDateInvalid(true);
        requestAnimationFrame(() =>
          document.getElementById("report-end")?.focus(),
        );
      }
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <PageTitle title="Báo cáo giao dịch và doanh thu" />
      <section className="panel">
        <h2>Lọc thời gian</h2>
        <p>
          Ngày tại Việt Nam, gồm cả ngày kết thúc. Doanh thu chỉ từ đơn đã hoàn
          tất.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(1, { start, end });
          }}
        >
          <div className="report-filters">
            <div>
              <label htmlFor="report-start">Từ ngày</label>
              <input
                id="report-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="report-end">Đến ngày</label>
              <input
                id="report-end"
                type="date"
                value={end}
                aria-invalid={dateInvalid}
                aria-describedby={dateInvalid ? "report-date-error" : undefined}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
              {dateInvalid && (
                <span className="field-error" id="report-date-error">
                  Ngày kết thúc phải từ ngày bắt đầu, khoảng tối đa 366 ngày.
                </span>
              )}
            </div>
            <button disabled={offline || loading}>Áp dụng bộ lọc</button>
          </div>
        </form>
      </section>
      {loading && <Loading />}
      {error && (
        <DataError
          error={error}
          stale={!!data}
          retry={() => void load(1, { start, end })}
        />
      )}
      {data && (
        <section
          className="panel report-result"
          role="region"
          aria-label="Kết quả báo cáo"
        >
          <h2>Doanh thu: {money(data.revenue)}</h2>
          <p>
            {data.orderCount} đơn hoàn tất · Khoảng {range?.start} đến{" "}
            {range?.end}
          </p>
          <p className="hint">
            Cập nhật lúc {new Date(data.asOf).toLocaleString("vi-VN")}
          </p>
          <dl className="status-counts">
            {data.paymentCounts.map((item) => (
              <div key={item.status}>
                <dt>{statusText[item.status]}</dt>
                <dd>{item.count}</dd>
              </div>
            ))}
          </dl>
          {!data.orderCount ? (
            <p>Không có đơn hoàn tất trong khoảng này. Doanh thu bằng 0.</p>
          ) : (
            <>
              <ul className="receipt-lines">
                {data.orders.map((order) => (
                  <li key={order.id}>
                    <span>
                      <b>Mã đơn: {order.id}</b>
                      <small>
                        Giao dịch: {order.paymentId} ·{" "}
                        {new Date(order.completedAt).toLocaleString("vi-VN", {
                          timeZone: "Asia/Ho_Chi_Minh",
                        })}
                      </small>
                    </span>
                    <b>{money(order.amount)}</b>
                  </li>
                ))}
              </ul>
              <Pagination
                page={data.page}
                hasNext={data.page * 20 < data.orderCount}
                busy={offline || loading}
                change={(page) => void load(page)}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}

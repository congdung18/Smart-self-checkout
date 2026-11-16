import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "./api";
export const errorText = (e: unknown) => {
  const messages: Record<string, string> = {
    PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm. Kiểm tra mã rồi thử lại.",
    PRODUCT_INACTIVE:
      "Sản phẩm đã ngừng bán. Hãy bỏ khỏi giỏ trước khi tiếp tục.",
    CART_LOCKED: "Giỏ đang khóa. Hãy kiểm tra trạng thái thanh toán.",
    CART_VERSION_CONFLICT: "Giỏ đã thay đổi. Hãy kiểm tra lại dữ liệu mới.",
    PRICE_CHANGED:
      "Giá đã thay đổi. Giỏ đã cập nhật giá mới; hãy kiểm tra và xác nhận lại.",
    INSUFFICIENT_STOCK:
      "Không đủ hàng. Hãy giảm số lượng hoặc bỏ sản phẩm khỏi giỏ.",
    LOGIN_FAILED: "Tên đăng nhập hoặc mật khẩu chưa đúng.",
    CSRF_INVALID: "Phiên bảo vệ đã thay đổi. Tải lại trang để tiếp tục.",
    KEY_REUSED: "Yêu cầu trước đang được đối chiếu. Hãy tải lại giỏ.",
    VALIDATION_ERROR: "Kiểm tra các trường được đánh dấu.",
    DUPLICATE_CODE: "SKU hoặc barcode đã được sử dụng.",
    FORBIDDEN: "Tài khoản không có quyền thực hiện thao tác này.",
    AUTH_REQUIRED: "Hãy đăng nhập để tiếp tục.",
    PRODUCT_VERSION_CONFLICT:
      "Sản phẩm đã thay đổi ở phiên khác. Tải bản mới trước khi lưu lại.",
    INVALID_DATE_RANGE: "Chọn khoảng ngày hợp lệ, tối đa 366 ngày.",
    GATEWAY_UNAVAILABLE:
      "Gateway chưa phản hồi. Giữ nguyên giao dịch và kiểm tra lại.",
  };
  return e instanceof ApiError
    ? messages[e.code] || `Không thực hiện được (${e.code}). Hãy thử lại.`
    : "Mất kết nối. Dữ liệu cũ được giữ lại; hãy thử tải lại.";
};
export const statusText: Record<string, string> = {
  active: "Đang hoạt động",
  cancelled: "Đã hủy",
  completed: "Hoàn tất",
  initiating: "Đang tạo giao dịch",
  pending: "Đang chờ thanh toán",
  unknown: "Chưa xác nhận kết quả",
  success: "Thành công",
  failure: "Thất bại đã xác minh",
};
export function Loading() {
  return (
    <div className="skeleton" role="status">
      Đang tải dữ liệu…
    </div>
  );
}
export function DataError({
  error,
  stale,
  retry,
}: {
  error: string;
  stale?: boolean;
  retry: () => void;
}) {
  return (
    <div className="banner error" role="alert">
      <span>
        {error}
        {stale && " Dữ liệu đang hiển thị chưa được cập nhật."}
      </span>
      <button className="secondary" onClick={retry}>
        Thử lại
      </button>
    </div>
  );
}
export function Pagination({
  page,
  hasNext,
  busy,
  change,
}: {
  page: number;
  hasNext: boolean;
  busy: boolean;
  change: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <button
        className="secondary"
        disabled={busy || page === 1}
        onClick={() => change(page - 1)}
      >
        Trang trước
      </button>
      <span>Trang {page}</span>
      <button
        className="secondary"
        disabled={busy || !hasNext}
        onClick={() => change(page + 1)}
      >
        Trang sau
      </button>
    </div>
  );
}
export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const value = await loader();
      if (id === request.current) setData(value);
    } catch (e) {
      if (id === request.current) setError(errorText(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [loader]);
  useEffect(() => {
    void reload();
    return () => {
      ++request.current;
    };
  }, [reload]);
  return { data, error, loading, reload };
}
export type Confirmation = { text: string; action: () => Promise<void> };
export function ConfirmDialog({
  value,
  close,
  run,
  busy,
}: {
  value: Confirmation | null;
  close: () => void;
  run: (action: () => Promise<void>) => Promise<void>;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (value) ref.current?.showModal();
    else ref.current?.close();
  }, [value]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      onCancel={close}
    >
      <h2 id="confirm-title">Xác nhận thao tác</h2>
      <p id="confirm-description">{value?.text}</p>
      <div className="actions">
        <button autoFocus className="secondary" onClick={close}>
          Giữ nguyên
        </button>
        <button
          disabled={busy}
          onClick={() => {
            const action = value?.action;
            close();
            if (action) void run(action);
          }}
        >
          Xác nhận
        </button>
      </div>
    </dialog>
  );
}
export function PageTitle({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">SMART SELF-CHECKOUT</p>
        <h1 tabIndex={-1}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

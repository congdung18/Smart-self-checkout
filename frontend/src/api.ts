export class ApiError extends Error {
  constructor(
    public code: string,
    public details: { field: string; issue: string }[] = [],
  ) {
    super(code);
  }
}
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error?.code || "REQUEST_FAILED",
      Array.isArray(result.error?.details) ? result.error.details : [],
    );
  return result as T;
}
export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  active?: boolean;
  version?: number;
  stock?: { onHand: number; reserved: number };
};
export type Cart = {
  id: string;
  status: string;
  version: number;
  amount: number;
  locked: boolean;
  paymentId: string | null;
  orderId: string | null;
  items: {
    id: string;
    productId: string;
    name: string;
    sku: string;
    barcode: string;
    quantity: number;
    unitPrice: number;
  }[];
};
export type User = { id: string; username: string; role: "staff" | "admin" };
export type Line = {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
};
export type Payment = {
  id: string;
  status: string;
  completion: string;
  amount: number;
  currency: string;
  qr: string;
  snapshot: Line[];
  order: { id: string; completedAt: string; items: Line[] } | null;
};
export const money = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    n,
  );

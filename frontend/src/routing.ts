import { useEffect, useState } from "react";
export type Page =
  | "home"
  | "scan"
  | "cart"
  | "payment"
  | "receipt"
  | "login"
  | "products"
  | "productForm"
  | "inventory"
  | "monitor"
  | "reports";
export type Route = {
  page: Page;
  audience: "customer" | "staff" | "admin";
  productId?: string;
};
export const paths: Partial<Record<Page, string>> = {
  home: "/customer/home",
  scan: "/customer/scan",
  cart: "/customer/cart",
  payment: "/customer/payment",
  receipt: "/customer/receipt",
  login: "/login",
  products: "/admin/products",
  inventory: "/admin/inventory",
  reports: "/admin/reports",
  monitor: "/staff/sessions",
  productForm: "/admin/products/new",
};
export function readRoute(): Route {
  const path = location.hash.slice(1).replace(/\/$/, "") || "/customer/home";
  if (path === "/admin/sessions") return { page: "monitor", audience: "admin" };
  if (/^\/admin\/products\/[0-9a-f-]{36}$/i.test(path))
    return {
      page: "productForm",
      audience: "admin",
      productId: path.split("/")[3],
    };
  const page = (Object.keys(paths) as Page[]).find(
    (key) => paths[key] === path,
  );
  if (!page) return { page: "home", audience: "customer" };
  return {
    page,
    audience: path.startsWith("/admin/")
      ? "admin"
      : path.startsWith("/staff/")
        ? "staff"
        : "customer",
  };
}
export function navigate(page: Page, productId?: string, adminMonitor = false) {
  location.hash =
    page === "productForm" && productId
      ? `/admin/products/${productId}`
      : page === "monitor" && adminMonitor
        ? "/admin/sessions"
        : paths[page]!;
}
export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    if (!location.hash) history.replaceState(null, "", "#/customer/home");
    const change = () => {
      setRoute(readRoute());
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("h1")?.focus(),
      );
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}

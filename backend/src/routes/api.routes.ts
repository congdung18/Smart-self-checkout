import { Router, text, type RequestHandler } from "express";
import type { ApiController } from "../controllers/api.controller.js";
import { callbackSignature, loginLimit } from "../middlewares/security.js";
export function callbackRoutes(controller: ApiController, secret: string) {
  const router = Router();
  router.post(
    "/payment-events",
    text({ type: "application/json", limit: "16kb" }),
    callbackSignature(secret),
    controller.callback,
  );
  return router;
}
export function apiRoutes(
  c: ApiController,
  auth: { staff: RequestHandler; admin: RequestHandler },
) {
  const r = Router();
  r.get("/bootstrap", c.bootstrap);
  r.get("/health", c.health);
  r.post("/auth/login", loginLimit(), c.login);
  r.post("/auth/logout", c.logout);
  r.get("/products", c.lookup);
  r.get("/carts/current", c.currentCart);
  r.post("/carts", c.startCart);
  r.get("/carts/:id", c.cart);
  r.post("/carts/:id/items", c.add);
  r.patch("/carts/:id/items/:itemId", c.setQuantity);
  r.delete("/carts/:id/items/:itemId", c.remove);
  r.post("/carts/:id/cancel", c.cancel);
  r.post("/carts/:id/payments", c.pay);
  r.get("/payments/:id", c.payment);
  r.post("/payments/:id/simulate", c.simulate);
  r.get("/monitoring/carts", auth.staff, c.monitor);
  r.get("/inventory", auth.admin, c.inventory);
  r.post("/admin/products", auth.admin, c.createProduct);
  r.patch("/admin/products/:id", auth.admin, c.updateProduct);
  r.get("/admin/products/:id", auth.admin, c.product);
  r.get("/reports", auth.admin, c.report);
  return r;
}

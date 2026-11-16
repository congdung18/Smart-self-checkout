import { Router } from "express";
import type { GatewayController } from "../controllers/gateway.controller.js";
export function gatewayRoutes(controller: GatewayController) {
  const router = Router();
  router.post("/payments", controller.create);
  router.get("/payments/:id", controller.query);
  router.post("/payments/:id/outcome", controller.outcome);
  return router;
}

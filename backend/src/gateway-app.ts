import express from "express";
import type { PrismaClient } from "@prisma/client";
import type { GatewayConfig } from "./types/config.js";
import { GatewayRepository } from "./repositories/gateway.repository.js";
import { MockGatewayService } from "./services/mock-gateway.service.js";
import { GatewayController } from "./controllers/gateway.controller.js";
import { gatewayAuthentication, gatewayError } from "./middlewares/gateway.js";
import { gatewayRoutes } from "./routes/gateway.routes.js";
export function gatewayApp(db: PrismaClient, config: GatewayConfig) {
  const app = express();
  const controller = new GatewayController(
    new MockGatewayService(new GatewayRepository(db), config),
    config.secret,
  );
  app.disable("x-powered-by");
  app.use(
    express.text({ type: "application/json", limit: "16kb" }),
    gatewayAuthentication(config.secret),
  );
  app.use(gatewayRoutes(controller));
  app.use(gatewayError);
  return app;
}

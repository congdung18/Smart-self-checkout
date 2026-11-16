import express from "express";
import helmet from "helmet";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./types/config.js";
import { DomainError } from "./types/errors.js";
import { CheckoutRepository } from "./repositories/checkout.repository.js";
import { ApplicationRepository } from "./repositories/application.repository.js";
import { CheckoutService } from "./services/checkout.service.js";
import { ApplicationService } from "./services/application.service.js";
import { GatewayClient } from "./services/payment.service.js";
import { ApiController } from "./controllers/api.controller.js";
import { apiRoutes, callbackRoutes } from "./routes/api.routes.js";
import { csrfMiddleware, sessionMiddleware } from "./middlewares/session.js";
import { apiLimit, requestMetadata } from "./middlewares/security.js";
import { errorHandler } from "./middlewares/errors.js";
import { staffAuthentication } from "./middlewares/auth.js";
export type { AppConfig } from "./types/config.js";
export function createApp(db: PrismaClient, config: AppConfig) {
  const app = express();
  const checkout = new CheckoutService(new CheckoutRepository(db));
  const gateway = new GatewayClient(checkout, config);
  const application = new ApplicationService(
    new ApplicationRepository(db),
    checkout,
  );
  const controller = new ApiController(
    application,
    checkout,
    gateway,
    config.secure,
  );
  const session = sessionMiddleware(config);
  app.disable("x-powered-by");
  if (config.secure) app.set("trust proxy", "loopback");
  app.use(helmet(), requestMetadata);
  app.use("/v1", callbackRoutes(controller, config.secret));
  app.use(express.json({ limit: "64kb" }), session.middleware);
  app.use(
    "/v1",
    csrfMiddleware(config.origin),
    apiLimit(),
    apiRoutes(controller, {
      staff: staffAuthentication(application),
      admin: staffAuthentication(application, true),
    }),
  );
  app.use("/v1", (_req, _res, next) => next(new DomainError("NOT_FOUND", 404)));
  app.use(express.static(resolve("dist/frontend")));
  app.use(errorHandler);
  return { app, checkout, gateway, close: () => session.store.close() };
}

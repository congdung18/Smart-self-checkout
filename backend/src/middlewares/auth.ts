import type { RequestHandler } from "express";
import type { ApplicationService } from "../services/application.service.js";
export function staffAuthentication(
  service: ApplicationService,
  admin = false,
): RequestHandler {
  return async (req, _res, next) => {
    await service.requireStaff(req.session.userId, admin);
    next();
  };
}

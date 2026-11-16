import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { verifySignature } from "../utils/security.js";
import { DomainError } from "../types/errors.js";
export const requestMetadata: RequestHandler = (req, res, next) => {
  res.set("X-Request-Id", randomUUID());
  if (req.path.startsWith("/v1")) res.set("Cache-Control", "no-store");
  next();
};
export const apiLimit = () =>
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
export const loginLimit = () =>
  rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
export function callbackSignature(secret: string): RequestHandler {
  return (req, _res, next) => {
    if (
      typeof req.body !== "string" ||
      !verifySignature(
        secret,
        req.get("x-timestamp") || "",
        req.get("x-signature") || "",
        req.method,
        `${req.baseUrl}${req.path}`,
        req.body,
      )
    )
      return next(new DomainError("INVALID_SIGNATURE", 401));
    next();
  };
}

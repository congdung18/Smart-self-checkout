import type { RequestHandler, ErrorRequestHandler } from "express";
import { z } from "zod";
import { verifySignature } from "../utils/security.js";
import { DomainError } from "../types/errors.js";
export function gatewayAuthentication(secret: string): RequestHandler {
  return (req, res, next) => {
    if (
      !verifySignature(
        secret,
        req.get("x-timestamp") || "",
        req.get("x-signature") || "",
        req.method,
        `${req.baseUrl}${req.path}`,
        typeof req.body === "string" ? req.body : "",
      )
    ) {
      res.status(401).json({ error: "INVALID_SIGNATURE" });
      return;
    }
    try {
      req.body = req.body ? JSON.parse(req.body) : {};
      next();
    } catch {
      res.status(400).json({ error: "INVALID_JSON" });
    }
  };
}
export const gatewayError: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  res
    .status(
      error instanceof z.ZodError
        ? 400
        : error instanceof DomainError
          ? error.status
          : 500,
    )
    .json({
      error: error instanceof DomainError ? error.code : "GATEWAY_ERROR",
    });
};

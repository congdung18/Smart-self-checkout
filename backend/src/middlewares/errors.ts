import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { DomainError } from "../types/errors.js";
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  let status = 500,
    code = "INTERNAL_ERROR",
    details: unknown = null;
  if (error instanceof DomainError) {
    status = error.status;
    code = error.code;
    details = error.details;
  } else if (error instanceof z.ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    details = error.issues.map((x) => ({
      field: x.path.join("."),
      issue: x.message,
    }));
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    status = 409;
    code = "DUPLICATE_CODE";
    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.filter((x): x is string => typeof x === "string")
      : ["sku", "barcode"];
    details = fields.map((field) => ({ field, issue: "Mã đã được sử dụng." }));
  } else if (error instanceof SyntaxError) {
    status = 400;
    code = "INVALID_JSON";
  }
  if (status === 500)
    console.error(
      JSON.stringify({
        event: "request_failed",
        requestId: res.getHeader("X-Request-Id"),
      }),
    );
  res.status(status).json({
    error: {
      code,
      message: code,
      details,
      requestId: res.getHeader("X-Request-Id"),
    },
  });
};

import session from "express-session";
import pgSession from "connect-pg-simple";
import type { RequestHandler } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import type { AppConfig } from "../types/config.js";
import { DomainError } from "../types/errors.js";
declare module "express-session" {
  interface SessionData {
    owner: string;
    csrf: string;
    userId?: string;
  }
}
export function sessionMiddleware(config: AppConfig) {
  const Store = pgSession(session);
  const store = new Store({
    conString: config.databaseUrl,
    tableName: "session",
    createTableIfMissing: false,
    pruneSessionInterval: false,
  });
  return {
    store,
    middleware: session({
      name: "ssc.sid",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        secure: config.secure,
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  };
}
export function csrfMiddleware(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.session.owner) {
      req.session.owner = randomUUID();
      req.session.csrf = randomBytes(32).toString("hex");
    }
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (req.get("origin") !== origin ||
        req.get("x-csrf-token") !== req.session.csrf)
    )
      return next(new DomainError("CSRF_INVALID", 403));
    next();
  };
}

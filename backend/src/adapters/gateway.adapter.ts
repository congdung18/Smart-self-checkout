import type { GatewayConfig } from "../types/config.js";
import { DomainError } from "../types/errors.js";
import { signedHeaders, verifySignature } from "../utils/security.js";
import { eventSchema } from "../validators/checkout.js";
export class GatewayAdapter {
  constructor(private config: GatewayConfig) {}
  async exchange(route: string, method: string, value?: unknown) {
    const body = value ? JSON.stringify(value) : "";
    const response = await fetch(`${this.config.gatewayUrl}${route}`, {
      method,
      headers: signedHeaders(this.config.secret, method, route, body),
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 800),
    });
    if (!response.ok) throw new DomainError("GATEWAY_UNAVAILABLE", 503);
    if (route.endsWith("/outcome")) return null;
    const raw = await response.text();
    if (
      !verifySignature(
        this.config.secret,
        response.headers.get("x-timestamp") || "",
        response.headers.get("x-signature") || "",
        "RESPONSE",
        route,
        raw,
      )
    )
      throw new DomainError("GATEWAY_SIGNATURE", 503);
    return eventSchema.parse(JSON.parse(raw));
  }
}

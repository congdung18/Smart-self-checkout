import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { GatewayRepository } from "../repositories/gateway.repository.js";
import type { GatewayConfig } from "../types/config.js";
import { DomainError } from "../types/errors.js";
import { signedHeaders } from "../utils/security.js";
import { eventSchema, type GatewayEvent } from "../validators/checkout.js";
import type { gatewayInput } from "../validators/gateway.js";
export class MockGatewayService {
  constructor(
    private repository: GatewayRepository,
    private config: GatewayConfig,
  ) {}
  private async notify(event: GatewayEvent, twice = false) {
    const body = JSON.stringify(event),
      route = new URL(this.config.callbackUrl).pathname;
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      try {
        await fetch(this.config.callbackUrl, {
          method: "POST",
          headers: signedHeaders(this.config.secret, "POST", route, body),
          body,
          signal: AbortSignal.timeout(2000),
        });
      } catch {
        /* Durable state remains queryable. */
      }
    }
  }
  async create(data: z.infer<typeof gatewayInput>) {
    const existing = await this.repository.payment(data.id);
    if (
      existing &&
      (existing.amount !== data.amount ||
        existing.scenario !== data.scenario ||
        existing.currency !== data.currency)
    )
      throw new DomainError("REFERENCE_REUSED");
    const status =
      data.scenario === "failure"
        ? "failure"
        : ["success", "duplicate"].includes(data.scenario)
          ? "success"
          : "pending";
    const payment = await this.repository.create(data, status);
    const event = eventSchema.parse({
      eventId: randomUUID(),
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
    });
    if (!existing && status !== "pending")
      void this.notify(event, data.scenario === "duplicate");
    return event;
  }
  async query(id: string) {
    const payment = await this.repository.payment(id);
    if (!payment) throw new DomainError("NOT_FOUND", 404);
    return {
      eventId: randomUUID(),
      paymentId: id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
    };
  }
  async outcome(id: string, status: "success" | "failure") {
    const payment = await this.repository.transition(
      id,
      async (previous, save) => {
        if (previous.status !== "pending" && previous.status !== status)
          throw new DomainError("TERMINAL_CONFLICT");
        return save(status);
      },
    );
    await this.notify(
      {
        eventId: randomUUID(),
        paymentId: id,
        amount: payment.amount,
        currency: "VND",
        status,
      },
      payment.scenario === "duplicate",
    );
    return { accepted: true };
  }
}

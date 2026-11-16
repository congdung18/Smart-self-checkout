import QRCode from "qrcode";
import type { GatewayConfig } from "../types/config.js";
import { DomainError } from "../types/errors.js";
import { GatewayAdapter } from "../adapters/gateway.adapter.js";
import { CheckoutService } from "./checkout.service.js";
import type { PaymentInput } from "../validators/checkout.js";
export class GatewayClient {
  private adapter: GatewayAdapter;
  constructor(
    private checkout: CheckoutService,
    config: GatewayConfig,
  ) {
    this.adapter = new GatewayAdapter(config);
  }
  async create(id: string) {
    const p = await this.checkout.repository.payment(id);
    try {
      const event = await this.adapter.exchange("/payments", "POST", {
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        scenario: p.scenario,
      });
      if (event) await this.checkout.apply(event);
    } catch {
      await this.checkout.repository.markUnknown(id);
    }
  }
  async refresh(id: string) {
    const p = await this.checkout.repository.payment(id);
    if (p.status === "success") return this.checkout.complete(id);
    if (p.status === "failure") return;
    if (p.status === "initiating") return this.create(id);
    const event = await this.adapter.exchange(`/payments/${id}`, "GET");
    if (event) await this.checkout.apply(event);
  }
  async owned(id: string, owner: string) {
    const p = await this.checkout.repository.ownedPayment(id, owner);
    if (!p) throw new DomainError("NOT_FOUND", 404);
    return p;
  }
  async start(cartId: string, owner: string, input: PaymentInput) {
    const p = await this.checkout.prepare(cartId, owner, input);
    // The reservation transaction has committed before any HTTP gateway call.
    await this.create(p.id);
    return { id: p.id };
  }
  async read(id: string, owner: string) {
    await this.owned(id, owner);
    try {
      await this.refresh(id);
    } catch {
      /* Return durable state until reconciliation retries. */
    }
    const p = await this.owned(id, owner);
    return {
      id: p.id,
      status: p.status,
      completion: p.completion,
      amount: p.amount,
      currency: p.currency,
      snapshot: p.snapshot,
      order: p.order,
      qr: await QRCode.toDataURL(`ssc-demo:${p.id}:${p.amount}:VND`),
    };
  }
  async outcome(id: string, status: "success" | "failure") {
    await this.adapter.exchange(`/payments/${id}/outcome`, "POST", { status });
    await this.refresh(id);
  }
  async simulate(id: string, owner: string, status: "success" | "failure") {
    await this.owned(id, owner);
    await this.outcome(id, status);
    return { accepted: true };
  }
  async reconcile() {
    for (const p of await this.checkout.repository.unresolved()) {
      try {
        await this.refresh(p.id);
      } catch {
        console.warn(
          JSON.stringify({ event: "reconciliation_required", paymentId: p.id }),
        );
      }
    }
  }
}

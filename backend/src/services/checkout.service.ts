import {
  CheckoutRepository,
  type CheckoutTransaction,
} from "../repositories/checkout.repository.js";
import { DomainError } from "../types/errors.js";
import { digest } from "../utils/security.js";
import {
  snapshotSchema,
  type GatewayEvent,
  type PaymentInput,
} from "../validators/checkout.js";
type LockedCart = NonNullable<
  Awaited<ReturnType<CheckoutTransaction["lockCart"]>>
>;
const amount = (items: { unitPrice: number; quantity: number }[]) => {
  const value = items.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0);
  if (!Number.isSafeInteger(value) || value > 2_000_000_000)
    throw new DomainError("AMOUNT_LIMIT", 422);
  return value;
};
export class CheckoutService {
  constructor(public repository: CheckoutRepository) {}
  private async lockCart(tx: CheckoutTransaction, id: string, owner?: string) {
    const cart = await tx.lockCart(id, owner);
    if (!cart) throw new DomainError("NOT_FOUND", 404);
    return cart;
  }
  private editable(cart: LockedCart, version: number) {
    if (
      cart.status !== "active" ||
      cart.payments.some((p) => p.status !== "failure")
    )
      throw new DomainError("CART_LOCKED");
    if (cart.version !== version)
      throw new DomainError("CART_VERSION_CONFLICT");
  }
  async cart(id: string, owner: string) {
    const cart = await this.repository.cart(id, owner);
    if (!cart) throw new DomainError("NOT_FOUND", 404);
    const latest = cart.payments[0];
    const locked =
      cart.status !== "active" || !!(latest && latest.status !== "failure");
    const frozen =
      locked && latest && latest.status !== "failure"
        ? snapshotSchema.parse(latest.snapshot)
        : null;
    const items = cart.items.map((x) => {
      const line = frozen?.find((l) => l.productId === x.productId);
      return {
        id: x.id,
        productId: x.productId,
        name: line?.name ?? x.product.name,
        sku: line?.sku ?? x.product.sku,
        barcode: line?.barcode ?? x.product.barcode,
        quantity: line?.quantity ?? x.quantity,
        unitPrice: line?.unitPrice ?? x.unitPrice,
      };
    });
    return {
      id: cart.id,
      status: cart.status,
      version: cart.version,
      items,
      amount: amount(items),
      currency: "VND",
      locked,
      paymentId: latest?.id ?? null,
      orderId: cart.order?.id ?? null,
    };
  }
  async mutate(
    id: string,
    owner: string,
    version: number,
    action:
      | { kind: "add"; productId: string; quantity: number; key: string }
      | { kind: "set"; itemId: string; quantity: number }
      | { kind: "delete"; itemId: string }
      | { kind: "cancel" },
  ) {
    await this.repository.transaction(async (tx) => {
      const cart = await this.lockCart(tx, id, owner);
      if (action.kind === "add") {
        const hash = digest(
          JSON.stringify({
            productId: action.productId,
            quantity: action.quantity,
            version,
          }),
        );
        const prior = await tx.operation(id, action.key);
        if (prior) {
          if (prior.digest !== hash) throw new DomainError("KEY_REUSED");
          return;
        }
        this.editable(cart, version);
        const product = await tx.product(action.productId);
        if (!product?.active) throw new DomainError("PRODUCT_INACTIVE", 422);
        const existing = cart.items.find((x) => x.productId === product.id);
        const quantity = (existing?.quantity ?? 0) + action.quantity;
        if (quantity > 999 || (!existing && cart.items.length >= 100))
          throw new DomainError("CART_LIMIT", 422);
        // Early feedback matches the prototype; payment still reserves atomically.
        if (
          quantity >
          (product.stock?.onHand ?? 0) - (product.stock?.reserved ?? 0)
        )
          throw new DomainError("INSUFFICIENT_STOCK");
        amount([
          ...cart.items.filter((x) => x.productId !== product.id),
          { unitPrice: product.price, quantity },
        ]);
        await tx.upsertItem(id, product.id, quantity, product.price);
        await tx.rememberOperation(id, action.key, hash);
      } else {
        this.editable(cart, version);
        if (action.kind === "cancel") await tx.cancelCart(id);
        else {
          const item = cart.items.find((x) => x.id === action.itemId);
          if (!item) throw new DomainError("NOT_FOUND", 404);
          if (action.kind === "delete") await tx.deleteItem(item.id);
          else {
            const product = await tx.product(item.productId);
            if (!product?.active)
              throw new DomainError("PRODUCT_INACTIVE", 422);
            if (
              action.quantity >
              (product.stock?.onHand ?? 0) - (product.stock?.reserved ?? 0)
            )
              throw new DomainError("INSUFFICIENT_STOCK");
            amount(
              cart.items.map((x) =>
                x.id === item.id ? { ...x, quantity: action.quantity } : x,
              ),
            );
            await tx.setQuantity(item.id, action.quantity);
          }
        }
      }
      await tx.bumpCart(id);
    });
    return this.cart(id, owner);
  }
  async prepare(id: string, owner: string, input: PaymentInput) {
    const result = await this.repository.transaction(async (tx) => {
      const cart = await this.lockCart(tx, id, owner);
      const hash = digest(JSON.stringify(input));
      const previous = cart.payments.find((p) => p.key === input.key);
      if (previous) {
        if (previous.digest !== hash) throw new DomainError("KEY_REUSED");
        return { id: previous.id };
      }
      this.editable(cart, input.version);
      if (!cart.items.length) throw new DomainError("EMPTY_CART", 422);
      const lines = cart.items.map((x) => ({
        productId: x.productId,
        name: x.product.name,
        sku: x.product.sku,
        barcode: x.product.barcode,
        quantity: x.quantity,
        unitPrice: x.product.price,
      }));
      if (cart.items.some((x) => !x.product.active))
        throw new DomainError("PRODUCT_INACTIVE", 422);
      const total = amount(lines);
      if (
        total !== input.acceptedAmount ||
        cart.items.some((x) => x.unitPrice !== x.product.price)
      ) {
        for (const item of cart.items)
          await tx.setPrice(item.id, item.product.price);
        await tx.bumpCart(id);
        return { priceChanged: true };
      }
      for (const line of [...lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      )) {
        if ((await tx.reserve(line.productId, line.quantity)) !== 1)
          throw new DomainError("INSUFFICIENT_STOCK");
      }
      const payment = await tx.createPayment(id, input, hash, total, lines);
      return { id: payment.id };
    });
    if ("priceChanged" in result) throw new DomainError("PRICE_CHANGED");
    return this.repository.payment(result.id);
  }
  async apply(event: GatewayEvent) {
    await this.repository.transaction(async (tx) => {
      const initial = await tx.payment(event.paymentId);
      if (!initial) throw new DomainError("PAYMENT_NOT_FOUND", 404);
      await this.lockCart(tx, initial.cartId);
      const payment = (await tx.payment(initial.id))!;
      if (
        payment.amount !== event.amount ||
        payment.currency !== event.currency
      )
        throw new DomainError("PAYMENT_MISMATCH");
      const hash = digest(JSON.stringify(event));
      const seen = await tx.event(event.eventId);
      if (seen && seen.digest !== hash) throw new DomainError("EVENT_REUSED");
      if (seen) return;
      if (
        ["success", "failure"].includes(payment.status) &&
        event.status !== payment.status
      ) {
        if (event.status === "pending") return;
        throw new DomainError("TERMINAL_CONFLICT");
      }
      await tx.createEvent(event, hash);
      if (event.status === "failure" && payment.status !== "failure") {
        for (const hold of await tx.holds(payment.id)) {
          if ((await tx.release(hold.productId, hold.quantity)) !== 1)
            throw new DomainError("RESERVATION_MISMATCH");
        }
        await tx.settleHolds(payment.id, "released");
      }
      await tx.setPaymentStatus(payment.id, event.status);
    });
    if (event.status === "success") await this.complete(event.paymentId);
  }
  async complete(id: string) {
    await this.repository.transaction(async (tx) => {
      const initial = await tx.payment(id);
      if (!initial) throw new DomainError("PAYMENT_NOT_FOUND", 404);
      await this.lockCart(tx, initial.cartId);
      const payment = (await tx.payment(id))!;
      if (payment.order) return;
      if (payment.status !== "success")
        throw new DomainError("PAYMENT_NOT_VERIFIED");
      const lines = snapshotSchema.parse(payment.snapshot);
      const holds = await tx.holds(id);
      if (
        holds.length !== lines.length ||
        lines.some(
          (x) =>
            !holds.some(
              (h) => h.productId === x.productId && h.quantity === x.quantity,
            ),
        )
      )
        throw new DomainError("RESERVATION_MISMATCH");
      if (amount(lines) !== payment.amount)
        throw new DomainError("SNAPSHOT_MISMATCH");
      const order = await tx.createOrder(payment.cartId, id, payment.amount);
      for (const line of [...lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      )) {
        if ((await tx.sell(line.productId, line.quantity)) !== 1)
          throw new DomainError("RESERVATION_MISMATCH");
        await tx.createOrderItem(order.id, line);
      }
      await tx.settleHolds(id, "consumed");
      await tx.completePayment(id);
      await tx.completeCart(payment.cartId);
    });
  }
}

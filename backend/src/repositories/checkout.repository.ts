import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  GatewayEvent,
  PaymentInput,
  SnapshotLine,
} from "../validators/checkout.js";

export class CheckoutTransaction {
  constructor(private tx: Prisma.TransactionClient) {}
  async lockCart(id: string, owner?: string) {
    await this.tx
      .$queryRaw`SELECT id FROM "Cart" WHERE id = ${id}::uuid FOR UPDATE`;
    return this.tx.cart.findFirst({
      where: { id, ...(owner ? { ownerId: owner } : {}) },
      include: {
        items: { include: { product: true } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
  }
  operation(cartId: string, key: string) {
    return this.tx.cartOperation.findUnique({
      where: { cartId_key: { cartId, key } },
    });
  }
  product(id: string) {
    return this.tx.product.findUnique({
      where: { id },
      include: { stock: true },
    });
  }
  upsertItem(
    cartId: string,
    productId: string,
    quantity: number,
    unitPrice: number,
  ) {
    return this.tx.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: { cartId, productId, quantity, unitPrice },
      update: { quantity, unitPrice },
    });
  }
  rememberOperation(cartId: string, key: string, digest: string) {
    return this.tx.cartOperation.create({ data: { cartId, key, digest } });
  }
  cancelCart(id: string) {
    return this.tx.cart.update({
      where: { id },
      data: { status: "cancelled" },
    });
  }
  deleteItem(id: string) {
    return this.tx.cartItem.delete({ where: { id } });
  }
  setQuantity(id: string, quantity: number) {
    return this.tx.cartItem.update({ where: { id }, data: { quantity } });
  }
  setPrice(id: string, unitPrice: number) {
    return this.tx.cartItem.update({ where: { id }, data: { unitPrice } });
  }
  bumpCart(id: string) {
    return this.tx.cart.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
  }
  reserve(productId: string, quantity: number) {
    return this.tx
      .$executeRaw`UPDATE "Stock" SET reserved = reserved + ${quantity} WHERE "productId" = ${productId}::uuid AND "onHand" - reserved >= ${quantity}`;
  }
  createPayment(
    cartId: string,
    input: PaymentInput,
    digest: string,
    amount: number,
    lines: SnapshotLine[],
  ) {
    return this.tx.payment.create({
      data: {
        cartId,
        key: input.key,
        digest,
        amount,
        scenario: input.scenario,
        snapshot: lines,
        reservations: {
          create: lines.map((x) => ({
            productId: x.productId,
            quantity: x.quantity,
          })),
        },
      },
    });
  }
  payment(id: string) {
    return this.tx.payment.findUnique({
      where: { id },
      include: { order: true },
    });
  }
  event(id: string) {
    return this.tx.paymentEvent.findUnique({ where: { id } });
  }
  createEvent(event: GatewayEvent, digest: string) {
    return this.tx.paymentEvent.create({
      data: {
        id: event.eventId,
        paymentId: event.paymentId,
        status: event.status,
        digest,
      },
    });
  }
  holds(paymentId: string) {
    return this.tx.reservation.findMany({
      where: { paymentId, status: "held" },
      orderBy: { productId: "asc" },
    });
  }
  release(productId: string, quantity: number) {
    return this.tx
      .$executeRaw`UPDATE "Stock" SET reserved = reserved - ${quantity} WHERE "productId" = ${productId}::uuid AND reserved >= ${quantity}`;
  }
  settleHolds(paymentId: string, status: "released" | "consumed") {
    return this.tx.reservation.updateMany({
      where: { paymentId, status: "held" },
      data: { status },
    });
  }
  setPaymentStatus(id: string, status: string) {
    return this.tx.payment.update({ where: { id }, data: { status } });
  }
  createOrder(cartId: string, paymentId: string, amount: number) {
    return this.tx.order.create({ data: { cartId, paymentId, amount } });
  }
  sell(productId: string, quantity: number) {
    return this.tx
      .$executeRaw`UPDATE "Stock" SET "onHand" = "onHand" - ${quantity}, reserved = reserved - ${quantity} WHERE "productId" = ${productId}::uuid AND reserved >= ${quantity} AND "onHand" >= ${quantity}`;
  }
  createOrderItem(orderId: string, line: SnapshotLine) {
    return this.tx.orderItem.create({
      data: {
        ...line,
        orderId,
        movement: { create: { quantity: -line.quantity } },
      },
    });
  }
  completePayment(id: string) {
    return this.tx.payment.update({
      where: { id },
      data: { completion: "completed" },
    });
  }
  completeCart(id: string) {
    return this.tx.cart.update({
      where: { id },
      data: { status: "completed", version: { increment: 1 } },
    });
  }
}

export class CheckoutRepository {
  constructor(private db: PrismaClient) {}
  transaction<T>(work: (tx: CheckoutTransaction) => Promise<T>) {
    return this.db.$transaction((tx) => work(new CheckoutTransaction(tx)));
  }
  cart(id: string, ownerId: string) {
    return this.db.cart.findFirst({
      where: { id, ownerId },
      include: {
        items: { include: { product: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        order: true,
      },
    });
  }
  payment(id: string) {
    return this.db.payment.findUniqueOrThrow({ where: { id } });
  }
  ownedPayment(id: string, ownerId: string) {
    return this.db.payment.findFirst({
      where: { id, cart: { ownerId } },
      include: { order: { include: { items: true } } },
    });
  }
  markUnknown(id: string) {
    return this.db.payment.updateMany({
      where: { id, status: { in: ["initiating", "pending"] } },
      data: { status: "unknown" },
    });
  }
  unresolved() {
    return this.db.payment.findMany({
      where: {
        OR: [
          { status: { in: ["initiating", "pending", "unknown"] } },
          { status: "success", completion: { not: "completed" } },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: 20,
    });
  }
}

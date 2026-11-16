import type { PrismaClient } from "@prisma/client";
import type { ProductInput } from "../validators/checkout.js";
export class ApplicationRepository {
  constructor(private db: PrismaClient) {}
  health() {
    return this.db.$queryRaw`SELECT 1`;
  }
  user(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }
  userByName(username: string) {
    return this.db.user.findUnique({ where: { username } });
  }
  product(id: string) {
    return this.db.product.findUnique({
      where: { id },
      include: { stock: true },
    });
  }
  productsByCode(code: string) {
    return this.db.product.findMany({
      where: {
        active: true,
        OR: [{ sku: code.toUpperCase() }, { barcode: code }],
      },
      take: 2,
    });
  }
  latestCart(ownerId: string) {
    return this.db.cart.findFirst({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
  }
  startCart(ownerId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${ownerId}))`;
      return (
        (await tx.cart.findFirst({
          where: { ownerId, status: "active" },
          orderBy: { createdAt: "desc" },
        })) || (await tx.cart.create({ data: { ownerId } }))
      );
    });
  }
  monitoring(page: number) {
    return this.db.cart.findMany({
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            unitPrice: true,
            product: { select: { name: true, sku: true, barcode: true } },
          },
        },
        payments: {
          select: { id: true, status: true, completion: true, snapshot: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }
  inventory(page: number, search: string) {
    const where = search
      ? {
          OR: ["name", "sku", "barcode"].map((field) => ({
            [field]: { contains: search, mode: "insensitive" as const },
          })),
        }
      : {};
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.product.findMany({
          where,
          include: { stock: true },
          orderBy: { sku: "asc" },
          skip: (page - 1) * 20,
          take: 20,
        }),
        total: await tx.product.count({ where }),
      }),
      { isolationLevel: "RepeatableRead" },
    );
  }
  createProduct(data: ProductInput) {
    return this.db.product.create({
      data: { ...data, stock: { create: { onHand: 0 } } },
    });
  }
  updateProduct(id: string, version: number, data: ProductInput) {
    return this.db.product.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
  }
  report(start: Date, end: Date, page: number) {
    return this.db.$transaction(
      async (tx) => ({
        totals: await tx.order.aggregate({
          where: { completedAt: { gte: start, lt: end } },
          _count: true,
          _sum: { amount: true },
        }),
        counts: await tx.payment.groupBy({
          by: ["status"],
          where: { createdAt: { gte: start, lt: end } },
          _count: true,
        }),
        orders: await tx.order.findMany({
          where: { completedAt: { gte: start, lt: end } },
          select: {
            id: true,
            amount: true,
            paymentId: true,
            completedAt: true,
          },
          orderBy: [{ completedAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * 20,
          take: 20,
        }),
      }),
      { isolationLevel: "RepeatableRead" },
    );
  }
}

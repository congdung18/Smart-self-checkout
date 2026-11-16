import { randomBytes } from "node:crypto";
import { ApplicationRepository } from "../repositories/application.repository.js";
import { CheckoutService } from "./checkout.service.js";
import { DomainError } from "../types/errors.js";
import { verifyPassword } from "../utils/security.js";
import { snapshotSchema, type ProductInput } from "../validators/checkout.js";
export class ApplicationService {
  constructor(
    private repository: ApplicationRepository,
    private checkout: CheckoutService,
  ) {}
  health() {
    return this.repository.health();
  }
  async user(id?: string) {
    const user = id ? await this.repository.user(id) : null;
    return user
      ? { id: user.id, username: user.username, role: user.role }
      : null;
  }
  async requireStaff(id?: string, admin = false) {
    const user = await this.user(id);
    if (!user) throw new DomainError("AUTH_REQUIRED", 401);
    if (admin && user.role !== "admin") throw new DomainError("FORBIDDEN", 403);
    return user;
  }
  async login(username: string, password: string) {
    const user = await this.repository.userByName(username.toLowerCase());
    const hash =
      user?.passwordHash ??
      `${randomBytes(16).toString("hex")}:${randomBytes(64).toString("hex")}`;
    if (!verifyPassword(password, hash) || !user)
      throw new DomainError("LOGIN_FAILED", 401);
    return { id: user.id, username: user.username, role: user.role };
  }
  async lookup(code: string) {
    const products = await this.repository.productsByCode(code);
    if (!products.length) throw new DomainError("PRODUCT_NOT_FOUND", 404);
    if (products.length > 1) throw new DomainError("PRODUCT_CODE_AMBIGUOUS");
    const p = products[0];
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      price: p.price,
    };
  }
  async currentCart(owner: string) {
    const cart = await this.repository.latestCart(owner);
    return cart ? this.checkout.cart(cart.id, owner) : null;
  }
  async startCart(owner: string) {
    return this.checkout.cart(
      (await this.repository.startCart(owner)).id,
      owner,
    );
  }
  async monitoring(userId: string | undefined, page: number) {
    await this.requireStaff(userId);
    const carts = await this.repository.monitoring(page);
    const items = carts.map((cart) => {
      const payment = cart.payments[0];
      const frozen =
        payment && payment.status !== "failure"
          ? snapshotSchema.parse(payment.snapshot)
          : null;
      const lines = cart.items.map((item) => {
        const snapshot = frozen?.find((x) => x.productId === item.productId);
        return {
          quantity: snapshot?.quantity ?? item.quantity,
          unitPrice: snapshot?.unitPrice ?? item.unitPrice,
          product: {
            name: snapshot?.name ?? item.product.name,
            sku: snapshot?.sku ?? item.product.sku,
            barcode: snapshot?.barcode ?? item.product.barcode,
          },
        };
      });
      return {
        id: cart.id,
        status: cart.status,
        updatedAt: cart.updatedAt,
        items: lines,
        amount: lines.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0),
        payments: cart.payments.map(({ id, status, completion }) => ({
          id,
          status,
          completion,
        })),
      };
    });
    return { items, page, asOf: new Date().toISOString() };
  }
  async inventory(userId: string | undefined, page: number, search: string) {
    await this.requireStaff(userId, true);
    return {
      ...(await this.repository.inventory(page, search)),
      page,
      asOf: new Date().toISOString(),
    };
  }
  async createProduct(userId: string | undefined, data: ProductInput) {
    const actor = await this.requireStaff(userId, true);
    const product = await this.repository.createProduct(data);
    console.info(
      JSON.stringify({
        event: "product_created",
        actor: actor.id,
        productId: product.id,
      }),
    );
    return product;
  }
  async product(userId: string | undefined, id: string) {
    await this.requireStaff(userId, true);
    const product = await this.repository.product(id);
    if (!product) throw new DomainError("PRODUCT_NOT_FOUND", 404);
    return product;
  }
  async updateProduct(
    userId: string | undefined,
    id: string,
    version: number,
    data: ProductInput,
  ) {
    const actor = await this.requireStaff(userId, true);
    if (!(await this.repository.updateProduct(id, version, data)).count)
      throw new DomainError("PRODUCT_VERSION_CONFLICT");
    console.info(
      JSON.stringify({
        event: "product_updated",
        actor: actor.id,
        productId: id,
      }),
    );
    return { updated: true };
  }
  async report(
    userId: string | undefined,
    start: Date,
    end: Date,
    page: number,
  ) {
    await this.requireStaff(userId, true);
    if (end <= start || end.getTime() - start.getTime() > 366 * 86400000)
      throw new DomainError("INVALID_DATE_RANGE", 422);
    const { totals, counts, orders } = await this.repository.report(
      start,
      end,
      page,
    );
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      page,
      orderCount: totals._count,
      revenue: totals._sum.amount || 0,
      currency: "VND",
      paymentCounts: [
        "initiating",
        "pending",
        "unknown",
        "failure",
        "success",
      ].map((status) => ({
        status,
        count: counts.find((x) => x.status === status)?._count ?? 0,
      })),
      orders,
      asOf: new Date().toISOString(),
    };
  }
}

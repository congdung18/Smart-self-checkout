// Compatibility entry point for existing scripts/tests. Implementation lives in layers.
import type { PrismaClient } from "@prisma/client";
import { CheckoutRepository } from "./repositories/checkout.repository.js";
import { CheckoutService } from "./services/checkout.service.js";
export { DomainError } from "./types/errors.js";
export * from "./validators/checkout.js";
export class Checkout extends CheckoutService {
  constructor(db: PrismaClient) {
    super(new CheckoutRepository(db));
  }
}

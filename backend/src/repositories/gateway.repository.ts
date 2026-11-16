import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { gatewayInput } from "../validators/gateway.js";
export class GatewayRepository {
  constructor(private db: PrismaClient) {}
  payment(id: string) {
    return this.db.gatewayPayment.findUnique({ where: { id } });
  }
  create(data: z.infer<typeof gatewayInput>, status: string) {
    return this.db.gatewayPayment.upsert({
      where: { id: data.id },
      create: { ...data, status },
      update: {},
    });
  }
  transition<T>(
    id: string,
    work: (
      payment: NonNullable<Awaited<ReturnType<GatewayRepository["payment"]>>>,
      save: (
        status: string,
      ) => Promise<
        NonNullable<Awaited<ReturnType<GatewayRepository["payment"]>>>
      >,
    ) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GatewayPayment" WHERE id = ${id}::uuid FOR UPDATE`;
      const payment = await tx.gatewayPayment.findUniqueOrThrow({
        where: { id },
      });
      return work(payment, (status) =>
        tx.gatewayPayment.update({ where: { id }, data: { status } }),
      );
    });
  }
}

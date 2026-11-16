import { z } from "zod";
export const uuid = z.uuid();
export const version = z.int().positive();
export const quantity = z.int().min(1).max(999);
export const key = z.string().min(8).max(128);
export const lineSchema = z.object({
  productId: uuid,
  name: z.string(),
  sku: z.string(),
  barcode: z.string(),
  unitPrice: z.int().nonnegative(),
  quantity,
});
export const snapshotSchema = z.array(lineSchema).min(1).max(100);
export const scenarioSchema = z.enum([
  "success",
  "failure",
  "pending",
  "timeout",
  "duplicate",
]);
export const eventSchema = z
  .object({
    eventId: uuid,
    paymentId: uuid,
    amount: z.int().nonnegative(),
    currency: z.literal("VND"),
    status: z.enum(["pending", "success", "failure"]),
  })
  .strict();
export type GatewayEvent = z.infer<typeof eventSchema>;
export type SnapshotLine = z.infer<typeof lineSchema>;
export const paymentInput = z
  .object({
    version,
    acceptedAmount: z.int().min(0).max(2_000_000_000),
    scenario: scenarioSchema,
    key,
  })
  .strict();
export type PaymentInput = z.infer<typeof paymentInput>;
export const productInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .transform((s) => s.toUpperCase()),
    barcode: z.string().trim().min(1).max(64),
    price: z.int().min(0).max(2_000_000_000),
    active: z.boolean(),
  })
  .strict();
export type ProductInput = z.infer<typeof productInput>;
export const listInput = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    search: z.string().trim().max(200).default(""),
  })
  .strict();
export const reportInput = z
  .object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();

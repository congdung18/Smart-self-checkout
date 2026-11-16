import { z } from "zod";
import { scenarioSchema } from "./checkout.js";
export const gatewayInput = z
  .object({
    id: z.uuid(),
    amount: z.int().min(0).max(2_000_000_000),
    currency: z.literal("VND"),
    scenario: scenarioSchema,
  })
  .strict();
export const outcomeInput = z
  .object({ status: z.enum(["success", "failure"]) })
  .strict();

import { z } from "zod"

const productId = z.string().regex(/^prod_[A-Za-z0-9]+$/)
const priceId = z.string().regex(/^price_[A-Za-z0-9]+$/)
export const catalogueChange = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("createProduct"),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500),
  }),
  z.object({
    kind: z.literal("editProduct"),
    productId,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500),
  }),
  z.object({ kind: z.literal("archiveProduct"), productId }),
  z
    .object({
      kind: z.literal("createPrice"),
      productId,
      amount: z.number().int().nonnegative().max(99999999),
      currency: z.string().regex(/^[a-z]{3}$/),
      interval: z.enum(["one_time", "day", "week", "month", "year"]),
      intervalCount: z.number().int().min(1).max(36),
    })
    .refine(
      (x) =>
        x.interval === "one_time" ||
        x.intervalCount <=
          { day: 1095, week: 156, month: 36, year: 3 }[x.interval],
      "Billing period exceeds three years"
    ),
  z.object({ kind: z.literal("archivePrice"), productId, priceId }),
  z.object({ kind: z.literal("defaultPrice"), productId, priceId }),
  z.object({ kind: z.literal("approvePremium"), productId, priceId }),
])

import { z } from "zod"
import { v } from "convex/values"

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
export const catalogueProduct = v.object({
  id: v.string(),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  active: v.boolean(),
  defaultPrice: v.union(v.string(), v.null()),
})
export const cataloguePrice = v.object({
  id: v.string(),
  active: v.boolean(),
  amount: v.union(v.number(), v.null()),
  currency: v.string(),
  interval: v.union(v.string(), v.null()),
  intervalCount: v.number(),
  approved: v.boolean(),
})

/** Verify freshness against signed Clerk claims, never the client's clock or Convex's filtered fva claim. */
export function requireCatalogueSessionClaims(
  payload: {
    sub?: string
    sid?: unknown
    iat?: number
    exp?: number
    fva?: unknown
  },
  identity: { clerkUserId: string; sessionId: string },
  now: number
) {
  const age = z
    .tuple([z.number().int(), z.number().int()])
    .safeParse(payload.fva)
  if (
    !identity.sessionId ||
    payload.sub !== identity.clerkUserId ||
    payload.sid !== identity.sessionId ||
    !payload.iat ||
    payload.iat > now + 5 ||
    now - payload.iat > 90 ||
    !payload.exp ||
    payload.exp <= now ||
    !age.success ||
    age.data[0] < 0 ||
    age.data[0] * 60 + Math.max(0, now - payload.iat) >= 300 ||
    (age.data[1] !== -1 &&
      (age.data[1] < 0 ||
        age.data[1] * 60 + Math.max(0, now - payload.iat) >= 300))
  )
    throw new Error(
      "Sign in again or reverify your session before changing financial settings."
    )
}

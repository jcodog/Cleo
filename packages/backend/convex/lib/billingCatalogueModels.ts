import { z } from "zod"
import { v } from "convex/values"

export { catalogueChange } from "@workspace/shared/billingCatalogue"
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
  usageType: v.union(v.string(), v.null()),
  approved: v.boolean(),
})

export class InvalidCatalogueSessionClaimsError extends Error {}

/** Verify freshness against signed Clerk claims, never the client's clock or Convex's filtered fva claim. */
export function requireCatalogueSessionClaims(
  payload: {
    sub?: string
    sid?: unknown
    iat?: number
    exp?: number
    fva?: unknown
    azp?: unknown
  },
  identity: { clerkUserId: string; sessionId: string },
  now: number,
  allowedOrigins: readonly string[]
) {
  const age = z
    .tuple([z.number().int(), z.number().int()])
    .safeParse(payload.fva)
  if (
    !identity.sessionId ||
    typeof payload.azp !== "string" ||
    !allowedOrigins.includes(payload.azp) ||
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
    throw new InvalidCatalogueSessionClaimsError(
      "Sign in again or reverify your session before changing financial settings."
    )
}

"use node"

import { z } from "zod"
import { stripeRequest, verifyStripeAccount } from "./stripeCommunity"

export const checkoutSession = z.object({
  id: z.string(),
  customer: z.string(),
  livemode: z.literal(false),
  mode: z.literal("subscription"),
  ui_mode: z.enum(["elements", "hosted"]).default("hosted"),
  status: z.enum(["open", "complete", "expired"]),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  client_secret: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  expires_at: z.number(),
})

export const newCheckoutSession = checkoutSession.extend({
  ui_mode: z.literal("elements"),
  client_secret: z.string().min(1),
})

export function hostedCheckoutUrl(session: z.infer<typeof checkoutSession>) {
  if (session.ui_mode !== "hosted" || !session.url)
    throw new Error(
      "Hosted checkout is unavailable. Cancel it before starting again."
    )
  const url = new URL(session.url)
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Untrusted hosted checkout URL.")
  return url.href
}

/** Bind checkout to the configured Cleo test account and an approved recurring price. */
export async function approvedCheckoutPrice(
  priceId: string,
  productId: string
) {
  await verifyStripeAccount()
  const price = z
    .object({
      id: z.string(),
      active: z.literal(true),
      livemode: z.literal(false),
      type: z.literal("recurring"),
      currency: z.string().length(3),
      unit_amount: z.number().int().positive(),
      recurring: z.object({
        interval: z.enum(["day", "week", "month", "year"]),
        interval_count: z.number().int().positive(),
        usage_type: z.literal("licensed"),
      }),
      product: z.object({
        id: z.string(),
        active: z.literal(true),
        name: z.string(),
      }),
    })
    .parse(
      await stripeRequest(
        `/prices/${encodeURIComponent(priceId)}?expand[]=product`
      )
    )
  if (price.id !== priceId || price.product.id !== productId)
    throw new Error("Stripe price does not match the approved Premium product.")
  return {
    name: price.product.name,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring.interval,
    intervalCount: price.recurring.interval_count,
  }
}

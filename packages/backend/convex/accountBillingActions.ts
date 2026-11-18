"use node"

import { z } from "zod"
import { v } from "convex/values"
import { action } from "./_generated/server"
import { internal } from "./_generated/api"
import { stripeRequest, verifyStripeAccount } from "./lib/stripeCommunity"

/** Read commercial details only for Prices attached to this purchaser's ledger. */
export const prices = action({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    next: v.union(v.string(), v.null()),
    prices: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        amount: v.union(v.number(), v.null()),
        currency: v.string(),
        interval: v.union(v.string(), v.null()),
        intervalCount: v.number(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.runQuery(internal.accountBilling.pricePage, {
      paginationOpts: { cursor: args.cursor ?? null, numItems: 20 },
    })
    const ids = page.priceIds
    if (ids.length) await verifyStripeAccount()
    const prices = await Promise.all(
      ids.map(async (id) => {
        const price = z
          .object({
            id: z.string(),
            livemode: z.literal(false),
            unit_amount: z.number().int().nullable(),
            currency: z.string(),
            recurring: z
              .object({
                interval: z.string(),
                interval_count: z.number().int().positive(),
              })
              .nullable(),
            product: z.object({ name: z.string() }),
          })
          .parse(
            await stripeRequest(
              `/prices/${encodeURIComponent(id)}?expand[]=product`
            )
          )
        if (price.id !== id) throw new Error("Price identity mismatch")
        return {
          id,
          name: price.product.name,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? null,
          intervalCount: price.recurring?.interval_count ?? 1,
        }
      })
    )
    return { prices, next: page.next }
  },
})

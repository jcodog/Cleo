import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireCurrentUser } from "./lib/auth"
import { subscriptionStatus } from "./dbTables/guildBilling"
import { backendEnv } from "@workspace/env/backend"

/** A purchaser's ledger remains available independently of Discord membership. */
export const overview = query({
  args: {},
  returns: v.object({
    clerkUserId: v.string(),
    canManageBilling: v.boolean(),
    hasMore: v.boolean(),
    subscriptions: v.array(
      v.object({
        id: v.id("guildSubscriptions"),
        priceId: v.string(),
        guildName: v.union(v.string(), v.null()),
        status: subscriptionStatus,
        startsAt: v.number(),
        endsAt: v.number(),
        reconciledAt: v.number(),
        cancelAtPeriodEnd: v.boolean(),
        paymentFailedAt: v.optional(v.number()),
        recognition: v.union(
          v.null(),
          v.object({
            id: v.id("paidCommunityActivations"),
            announce: v.boolean(),
            displayRole: v.boolean(),
            testMode: v.boolean(),
          })
        ),
      })
    ),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique()
    const rows = customer
      ? await ctx.db
          .query("guildSubscriptions")
          .withIndex("by_customer_id", (q) => q.eq("customerId", customer._id))
          .order("desc")
          .take(21)
      : []
    return {
      clerkUserId: user.clerkUserId,
      canManageBilling:
        !!customer &&
        !!backendEnv.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
        !!backendEnv.CLEO_DASHBOARD_ORIGIN,
      hasMore: rows.length > 20,
      subscriptions: await Promise.all(
        rows.slice(0, 20).map(async (row) => {
          const guild = await ctx.db.get(row.guildId)
          const recognition = await ctx.db
            .query("paidCommunityActivations")
            .withIndex("by_subscription", (q) =>
              q.eq("subscriptionId", row.stripeSubscriptionId)
            )
            .unique()
          return {
            id: row._id,
            priceId: row.stripePriceId,
            guildName: guild?.name ?? null,
            status: row.status,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            reconciledAt: row.reconciledAt,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
            paymentFailedAt: row.paymentFailedAt,
            recognition:
              recognition?.userId === user._id
                ? {
                    id: recognition._id,
                    announce: recognition.announce,
                    displayRole: recognition.displayRole,
                    testMode: recognition.testMode,
                  }
                : null,
          }
        })
      ),
    }
  },
})

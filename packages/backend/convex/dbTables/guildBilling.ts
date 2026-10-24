import { defineTable } from "convex/server"
import { v } from "convex/values"
import {
  CLEO_GUILD_CAPABILITIES,
  CLEO_GUILD_SUBSCRIPTION_STATUSES,
} from "@workspace/shared/cleoEntitlements"

export const guildCapability = v.union(
  ...CLEO_GUILD_CAPABILITIES.map((value) => v.literal(value))
)
export const subscriptionStatus = v.union(
  ...CLEO_GUILD_SUBSCRIPTION_STATUSES.map((value) => v.literal(value))
)
export const grantCategory = v.union(
  v.literal("complimentary"),
  v.literal("staff"),
  v.literal("test")
)

export const guildBillingPrices = defineTable({
  stripeProductId: v.string(),
  stripePriceId: v.string(),
  enabled: v.boolean(),
  updatedAt: v.number(),
}).index("by_stripe_price_id", ["stripePriceId"])

export const billingCustomers = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),
  stripeCustomerId: v.string(),
  createdAt: v.number(),
})
  .index("by_stripe_customer_id", ["stripeCustomerId"])
  .index("by_user_id", ["userId"])

export const guildSubscriptions = defineTable({
  customerId: v.id("billingCustomers"),
  guildId: v.id("guilds"),
  discordGuildId: v.string(),
  stripeSubscriptionId: v.string(),
  stripeProductId: v.string(),
  stripePriceId: v.string(),
  status: subscriptionStatus,
  startsAt: v.number(),
  endsAt: v.number(),
  trialEndsAt: v.optional(v.number()),
  graceEndsAt: v.optional(v.number()),
  paymentFailedAt: v.optional(v.number()),
  cancelAtPeriodEnd: v.boolean(),
  canceledAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  lastEventId: v.string(),
  eventCreatedAt: v.number(),
  revision: v.number(),
  reconciledAt: v.number(),
  nextReconcileAt: v.optional(v.union(v.number(), v.null())),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_stripe_subscription_id", ["stripeSubscriptionId"])
  .index("by_guild_id", ["guildId"])
  .index("by_guild_status_end", ["guildId", "status", "endsAt"])
  .index("by_guild_status_grace", ["guildId", "status", "graceEndsAt"])
  .index("by_customer_id", ["customerId"])
  .index("by_reconcile_due", ["nextReconcileAt"])

export const billingEvents = defineTable({
  eventId: v.string(),
  stripeSubscriptionId: v.string(),
  eventCreatedAt: v.number(),
  revision: v.number(),
  payload: v.string(),
  outcome: v.union(v.literal("applied"), v.literal("stale")),
  receivedAt: v.number(),
}).index("by_event_id", ["eventId"])

export const guildEntitlementGrants = defineTable({
  grantKey: v.string(),
  guildId: v.id("guilds"),
  discordGuildId: v.string(),
  category: grantCategory,
  capabilities: v.array(guildCapability),
  startsAt: v.number(),
  endsAt: v.number(),
  issuedBy: v.id("users"),
  reason: v.string(),
  revokedAt: v.optional(v.number()),
  revocationReason: v.optional(v.string()),
  revokedBy: v.optional(v.id("users")),
  createdAt: v.number(),
})
  .index("by_grant_key", ["grantKey"])
  .index("by_guild_id", ["guildId"])
  .index("by_guild_revocation_end", ["guildId", "revokedAt", "endsAt"])

import { ConvexError, v } from "convex/values"
import { internalMutation } from "../../_generated/server"
import {
  grantCategory,
  guildCapability,
  subscriptionStatus,
} from "../../dbTables/guildBilling"
import { GUILD_BILLING_MAX_GRACE_MS } from "@workspace/shared/cleoEntitlements"
import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"

function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID_BILLING_STATE", message })
}
function timestamp(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    invalid("Invalid lifecycle timestamp.")
}
function stripeId(value: string, prefix: string) {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value))
    invalid("Invalid Stripe identifier.")
}

/** Explicitly allow only Product/Price pairs that sell guild Premium. */
export const configurePrice = internalMutation({
  args: {
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    stripeId(args.stripeProductId, "prod")
    stripeId(args.stripePriceId, "price")
    const existing = await ctx.db
      .query("guildBillingPrices")
      .withIndex("by_stripe_price_id", (q) =>
        q.eq("stripePriceId", args.stripePriceId)
      )
      .unique()
    if (existing && existing.stripeProductId !== args.stripeProductId)
      invalid("Price cannot change Product.")
    if (existing)
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: Date.now(),
      })
    else
      await ctx.db.insert("guildBillingPrices", {
        ...args,
        updatedAt: Date.now(),
      })
    return null
  },
})

/** Called only after a trusted integration verifies the Clerk/customer association. */
export const associateCustomer = internalMutation({
  args: { clerkUserId: v.string(), stripeCustomerId: v.string() },
  returns: v.id("billingCustomers"),
  handler: async (ctx, args) => {
    stripeId(args.stripeCustomerId, "cus")
    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .unique()
    if (!owner || owner.status === "disabled")
      invalid("An active Clerk user is required.")
    const existing = await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripe_customer_id", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .unique()
    if (existing) {
      if (
        existing.userId !== owner._id ||
        existing.clerkUserId !== owner.clerkUserId
      )
        invalid("Customer ownership cannot be reassigned.")
      return existing._id
    }
    const other = await ctx.db
      .query("billingCustomers")
      .withIndex("by_user_id", (q) => q.eq("userId", owner._id))
      .unique()
    if (other) invalid("User already has a Stripe customer.")
    return ctx.db.insert("billingCustomers", {
      ...args,
      userId: owner._id,
      createdAt: Date.now(),
    })
  },
})

/** Full snapshots from verified events/reconciliation, never client-provided billing claims.
 * revision is a trusted monotonically increasing reconciliation sequence per subscription.
 */
export const reconcileSubscription = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    discordGuildId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    eventId: v.string(),
    eventCreatedAt: v.number(),
    revision: v.number(),
    status: subscriptionStatus,
    startsAt: v.number(),
    endsAt: v.number(),
    trialEndsAt: v.optional(v.number()),
    graceEndsAt: v.optional(v.number()),
    paymentFailedAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  },
  returns: v.union(
    v.literal("applied"),
    v.literal("duplicate"),
    v.literal("stale")
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    stripeId(args.stripeCustomerId, "cus")
    stripeId(args.stripeSubscriptionId, "sub")
    stripeId(args.stripeProductId, "prod")
    stripeId(args.stripePriceId, "price")
    if (!args.eventId.trim() || !isDiscordSnowflake(args.discordGuildId))
      invalid("Trusted event and Discord guild IDs are required.")
    for (const value of [
      args.startsAt,
      args.endsAt,
      args.eventCreatedAt,
      args.trialEndsAt,
      args.graceEndsAt,
      args.paymentFailedAt,
      args.canceledAt,
      args.revokedAt,
    ]) {
      if (value !== undefined) timestamp(value)
    }
    if (
      !Number.isSafeInteger(args.revision) ||
      args.revision < 1 ||
      args.eventCreatedAt > now ||
      args.startsAt > now ||
      args.endsAt <= args.startsAt
    )
      invalid("Invalid subscription period or event sequence.")
    if (
      args.status === "trialing" &&
      (args.trialEndsAt === undefined ||
        args.trialEndsAt <= args.startsAt ||
        args.trialEndsAt > args.endsAt)
    )
      invalid("Trial deadline is required within the subscription period.")
    if (
      args.status === "past_due" &&
      (args.paymentFailedAt === undefined ||
        args.paymentFailedAt > now ||
        args.paymentFailedAt < args.startsAt ||
        args.graceEndsAt === undefined ||
        args.graceEndsAt <= args.paymentFailedAt ||
        args.graceEndsAt > args.paymentFailedAt + GUILD_BILLING_MAX_GRACE_MS)
    )
      invalid("Payment failure requires a bounded grace period.")
    if (args.status !== "past_due" && args.graceEndsAt !== undefined)
      invalid("Grace applies only to past-due subscriptions.")
    if (
      (args.status === "active" ||
        args.status === "trialing" ||
        args.status === "past_due") &&
      (args.canceledAt !== undefined || args.revokedAt !== undefined)
    )
      invalid("Canceled or revoked subscriptions cannot be active.")
    if (args.status === "revoked" && args.revokedAt === undefined)
      invalid("Revocation timestamp is required.")
    if (args.status === "canceled" && args.canceledAt === undefined)
      invalid("Cancellation timestamp is required.")
    if (
      (args.revokedAt !== undefined && args.revokedAt > now) ||
      (args.canceledAt !== undefined && args.canceledAt > now)
    )
      invalid("Lifecycle changes cannot be in the future.")
    const payload = JSON.stringify(
      Object.fromEntries(
        Object.entries(args).sort(([a], [b]) => a.localeCompare(b))
      )
    )
    const receipt = await ctx.db
      .query("billingEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique()
    if (receipt) {
      if (receipt.payload !== payload)
        invalid("Event ID was reused with different billing data.")
      return "duplicate"
    }
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripe_customer_id", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .unique()
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    if (!customer || !guild) invalid("Customer and selected guild must exist.")
    const price = await ctx.db
      .query("guildBillingPrices")
      .withIndex("by_stripe_price_id", (q) =>
        q.eq("stripePriceId", args.stripePriceId)
      )
      .unique()
    if (!price || price.stripeProductId !== args.stripeProductId)
      invalid("Unrecognised guild Premium Product/Price.")
    const existing = await ctx.db
      .query("guildSubscriptions")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique()
    if (
      existing &&
      (existing.guildId !== guild._id ||
        existing.customerId !== customer._id ||
        existing.discordGuildId !== args.discordGuildId)
    )
      invalid("Subscription guild and owner cannot be reassigned.")
    const stale =
      existing !== null &&
      (args.revision <= existing.revision ||
        args.eventCreatedAt < existing.eventCreatedAt)
    await ctx.db.insert("billingEvents", {
      eventId: args.eventId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      eventCreatedAt: args.eventCreatedAt,
      revision: args.revision,
      payload,
      outcome: stale ? "stale" : "applied",
      receivedAt: now,
    })
    if (stale) return "stale"
    if (
      existing?.status === "past_due" &&
      args.status === "past_due" &&
      args.paymentFailedAt !== existing.paymentFailedAt
    )
      invalid("Grace cannot restart until payment recovers.")
    if (
      (existing?.status === "canceled" ||
        existing?.status === "incomplete_expired") &&
      (args.status === "active" ||
        args.status === "trialing" ||
        args.status === "past_due")
    )
      invalid(
        "A terminated subscription cannot be restored. Create a new subscription."
      )
    if (
      existing?.revokedAt !== undefined &&
      args.revokedAt !== existing.revokedAt
    )
      invalid(
        "A revoked subscription cannot be restored. Create a new subscription."
      )
    const { stripeCustomerId: _customer, eventId, ...snapshot } = args
    const value = {
      ...snapshot,
      customerId: customer._id,
      guildId: guild._id,
      lastEventId: eventId,
      reconciledAt: args.eventCreatedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    if (existing) await ctx.db.replace(existing._id, value)
    else await ctx.db.insert("guildSubscriptions", value)
    return "applied"
  },
})

export const issueGrant = internalMutation({
  args: {
    grantKey: v.string(),
    discordGuildId: v.string(),
    category: grantCategory,
    capabilities: v.array(guildCapability),
    startsAt: v.number(),
    endsAt: v.number(),
    issuedBy: v.id("users"),
    reason: v.string(),
  },
  returns: v.id("guildEntitlementGrants"),
  handler: async (ctx, args) => {
    timestamp(args.startsAt)
    timestamp(args.endsAt)
    if (
      !args.grantKey.trim() ||
      !args.reason.trim() ||
      !isDiscordSnowflake(args.discordGuildId) ||
      args.capabilities.length === 0 ||
      new Set(args.capabilities).size !== args.capabilities.length ||
      args.endsAt <= Math.max(Date.now(), args.startsAt) ||
      (args.category === "test" &&
        args.endsAt - args.startsAt > GUILD_BILLING_MAX_GRACE_MS)
    )
      invalid(
        "A scoped, expiring grant with a reason is required. Test grants last at most seven days."
      )
    const issuer = await ctx.db.get(args.issuedBy)
    if (!issuer || issuer.status === "disabled" || issuer.role === "user")
      invalid("An active staff issuer is required.")
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    if (!guild) invalid("Grant guild must exist.")
    const existing = await ctx.db
      .query("guildEntitlementGrants")
      .withIndex("by_grant_key", (q) => q.eq("grantKey", args.grantKey))
      .unique()
    if (existing) {
      const {
        grantKey,
        discordGuildId,
        category,
        capabilities,
        startsAt,
        endsAt,
        issuedBy,
        reason,
      } = existing
      if (
        JSON.stringify({
          grantKey,
          discordGuildId,
          category,
          capabilities,
          startsAt,
          endsAt,
          issuedBy,
          reason,
        }) !==
        JSON.stringify({
          grantKey: args.grantKey,
          discordGuildId: args.discordGuildId,
          category: args.category,
          capabilities: args.capabilities,
          startsAt: args.startsAt,
          endsAt: args.endsAt,
          issuedBy: args.issuedBy,
          reason: args.reason,
        })
      )
        invalid("Grant key cannot be reused with different terms.")
      return existing._id
    }
    return ctx.db.insert("guildEntitlementGrants", {
      ...args,
      guildId: guild._id,
      createdAt: Date.now(),
    })
  },
})

export const revokeGrant = internalMutation({
  args: { grantKey: v.string(), revokedBy: v.id("users"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const issuer = await ctx.db.get(args.revokedBy)
    if (
      !issuer ||
      issuer.status === "disabled" ||
      issuer.role === "user" ||
      !args.reason.trim()
    )
      invalid("Staff and a revocation reason are required.")
    const grant = await ctx.db
      .query("guildEntitlementGrants")
      .withIndex("by_grant_key", (q) => q.eq("grantKey", args.grantKey))
      .unique()
    if (!grant) invalid("Grant does not exist.")
    if (grant.revokedAt === undefined)
      await ctx.db.patch(grant._id, {
        revokedAt: Date.now(),
        revokedBy: args.revokedBy,
        revocationReason: args.reason,
      })
    return null
  },
})

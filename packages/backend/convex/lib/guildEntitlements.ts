import {
  resolveCleoGuildAccess,
  GUILD_BILLING_MAX_CONCURRENT_SOURCES,
  type CleoGuildAccessRecord,
} from "@workspace/shared/cleoEntitlements"
import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

type BillingDb = Pick<QueryCtx, "db">
export function subscriptionCandidates(
  ctx: BillingDb,
  guildId: Id<"guilds">,
  status: "active" | "trialing" | "past_due",
  now: number
) {
  return status === "past_due"
    ? ctx.db
        .query("guildSubscriptions")
        .withIndex("by_guild_status_grace", (q) =>
          q.eq("guildId", guildId).eq("status", status).gt("graceEndsAt", now)
        )
        .take(GUILD_BILLING_MAX_CONCURRENT_SOURCES + 1)
    : ctx.db
        .query("guildSubscriptions")
        .withIndex("by_guild_status_end", (q) =>
          q.eq("guildId", guildId).eq("status", status).gt("endsAt", now)
        )
        .take(GUILD_BILLING_MAX_CONCURRENT_SOURCES + 1)
}
export function grantCandidates(
  ctx: BillingDb,
  guildId: Id<"guilds">,
  now: number
) {
  return ctx.db
    .query("guildEntitlementGrants")
    .withIndex("by_guild_revocation_end", (q) =>
      q.eq("guildId", guildId).eq("revokedAt", undefined).gt("endsAt", now)
    )
    .take(GUILD_BILLING_MAX_CONCURRENT_SOURCES + 1)
}

export async function getGuildAccess(
  ctx: BillingDb,
  guild: Doc<"guilds">,
  now = Date.now()
) {
  const [active, trial, grace, grants, revokedGrant, revokedSubscription] =
    await Promise.all([
      subscriptionCandidates(ctx, guild._id, "active", now),
      subscriptionCandidates(ctx, guild._id, "trialing", now),
      subscriptionCandidates(ctx, guild._id, "past_due", now),
      grantCandidates(ctx, guild._id, now),
      ctx.db
        .query("guildEntitlementGrants")
        .withIndex("by_guild_revocation_end", (q) =>
          q.eq("guildId", guild._id).gt("revokedAt", undefined)
        )
        .order("desc")
        .first(),
      ctx.db
        .query("guildSubscriptions")
        .withIndex("by_guild_status_end", (q) =>
          q.eq("guildId", guild._id).eq("status", "revoked")
        )
        .order("desc")
        .first(),
    ])
  // Ingestion enforces the same limit. Corrupt or externally inserted excess
  // sources fail closed rather than granting access from an arbitrary subset.
  if (
    [active, trial, grace, grants].some(
      (rows) => rows.length > GUILD_BILLING_MAX_CONCURRENT_SOURCES
    )
  )
    return resolveCleoGuildAccess({
      discordGuildId: guild.discordGuildId,
      now,
      records: [],
    })
  const subscriptions = [...active, ...trial, ...grace]
  const prices = new Map(
    await Promise.all(
      [...new Set(subscriptions.map((row) => row.stripePriceId))].map(
        async (id) =>
          [
            id,
            await ctx.db
              .query("guildBillingPrices")
              .withIndex("by_stripe_price_id", (q) => q.eq("stripePriceId", id))
              .unique(),
          ] as const
      )
    )
  )
  const customers = new Map(
    await Promise.all(
      [...new Set(subscriptions.map((row) => row.customerId))].map(
        async (id) => [id, await ctx.db.get(id)] as const
      )
    )
  )
  const owners = new Map(
    await Promise.all(
      [
        ...new Set(
          [...customers.values()].flatMap((customer) =>
            customer ? [customer.userId] : []
          )
        ),
      ].map(async (id) => [id, await ctx.db.get(id)] as const)
    )
  )
  const records: CleoGuildAccessRecord[] = []
  for (const subscription of subscriptions) {
    const price = prices.get(subscription.stripePriceId)
    const customer = customers.get(subscription.customerId)
    const owner = customer ? owners.get(customer.userId) : undefined
    if (
      !price?.enabled ||
      price.stripeProductId !== subscription.stripeProductId ||
      !customer ||
      !owner ||
      owner.clerkUserId !== customer.clerkUserId ||
      subscription.discordGuildId !== guild.discordGuildId
    )
      continue
    records.push({ ...subscription, kind: "subscription" })
  }
  for (const grant of grants) records.push({ ...grant, kind: "grant" })
  if (revokedGrant) records.push({ ...revokedGrant, kind: "grant" })
  if (revokedSubscription)
    records.push({ ...revokedSubscription, kind: "subscription" })
  return resolveCleoGuildAccess({
    discordGuildId: guild.discordGuildId,
    now,
    records,
  })
}

import {
  resolveCleoGuildAccess,
  type CleoGuildAccessRecord,
} from "@workspace/shared/cleoEntitlements"
import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

export async function getGuildAccess(
  ctx: Pick<QueryCtx, "db">,
  guild: Doc<"guilds">,
  now = Date.now()
) {
  const subscriptions = await ctx.db
    .query("guildSubscriptions")
    .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
    .collect()
  const grants = await ctx.db
    .query("guildEntitlementGrants")
    .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
    .collect()
  const records: CleoGuildAccessRecord[] = []
  for (const subscription of subscriptions) {
    const price = await ctx.db
      .query("guildBillingPrices")
      .withIndex("by_stripe_price_id", (q) =>
        q.eq("stripePriceId", subscription.stripePriceId)
      )
      .unique()
    const customer = await ctx.db.get(subscription.customerId)
    const owner = customer ? await ctx.db.get(customer.userId) : null
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
  for (const grant of grants) {
    if (grant.discordGuildId !== guild.discordGuildId) continue
    records.push({ ...grant, kind: "grant" })
  }
  return resolveCleoGuildAccess({
    discordGuildId: guild.discordGuildId,
    now,
    records,
  })
}

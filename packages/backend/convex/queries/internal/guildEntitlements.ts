import { v } from "convex/values"
import { internalQuery } from "../../_generated/server"
import { getGuildAccess } from "../../lib/guildEntitlements"
import { guildCapability } from "../../dbTables/guildBilling"

export const resolve = internalQuery({
  args: { discordGuildId: v.string() },
  returns: v.object({
    capabilities: v.array(guildCapability),
    state: v.union(
      v.literal("active"),
      v.literal("trial"),
      v.literal("grace"),
      v.literal("expired"),
      v.literal("revoked")
    ),
    validUntil: v.number(),
  }),
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    return guild
      ? getGuildAccess(ctx, guild)
      : { capabilities: [], state: "expired" as const, validUntil: Date.now() }
  },
})

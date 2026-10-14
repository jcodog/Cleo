import { v } from "convex/values"
import { internalQuery } from "../../_generated/server"
import { getGuildAccess } from "../../lib/guildEntitlements"
import {
  GUILD_WELCOME_PREMIUM_STYLE,
  GUILD_TWITCH_PREMIUM_STYLE,
} from "@workspace/shared/cleoEntitlements"
import { guildCapability } from "../../dbTables/guildBilling"

export const resolve = internalQuery({
  args: { discordGuildId: v.string() },
  returns: v.object({
    capabilities: v.array(guildCapability),
    capabilityDeadlines: v.object({
      welcomePremiumStyle: v.optional(v.number()),
      twitchPremiumStyle: v.optional(v.number()),
    }),
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
    const access = guild
      ? await getGuildAccess(ctx, guild)
      : {
          capabilities: [],
          capabilityDeadlines: {},
          state: "expired" as const,
          validUntil: Date.now(),
        }
    return {
      ...access,
      // Capability names remain values; declared Convex fields use identifiers.
      capabilityDeadlines: {
        welcomePremiumStyle:
          access.capabilityDeadlines[GUILD_WELCOME_PREMIUM_STYLE],
        twitchPremiumStyle:
          access.capabilityDeadlines[GUILD_TWITCH_PREMIUM_STYLE],
      },
    }
  },
})

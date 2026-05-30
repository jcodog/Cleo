import { v } from "convex/values"

import { internalMutation } from "../../../../_generated/server"

export const mark = internalMutation({
  args: {
    discordGuildId: v.string(),
    verifiedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (!guild) {
      return null
    }

    if (
      guild.botLeftAt !== undefined ||
      (guild.botJoinedAt === undefined &&
        guild.botInstallationVerifiedAt === undefined)
    ) {
      return null
    }

    await ctx.db.patch(guild._id, {
      botLeftAt: args.verifiedAt,
      lastSyncedAt: args.verifiedAt,
      updatedAt: args.verifiedAt,
    })

    return null
  },
})

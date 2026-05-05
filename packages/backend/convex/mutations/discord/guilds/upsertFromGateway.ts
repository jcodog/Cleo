import { v } from "convex/values"
import { internalMutation } from "../../../_generated/server"

export const upsert = internalMutation({
  args: {
    discordGuildId: v.string(),
    name: v.string(),
    iconUrl: v.optional(v.string()),
    ownerDiscordId: v.optional(v.string()),
    botJoinedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    const existing = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        ...(args.iconUrl !== undefined ? { iconUrl: args.iconUrl } : {}),
        ...(args.ownerDiscordId !== undefined
          ? { ownerDiscordId: args.ownerDiscordId }
          : {}),
        ...(args.botJoinedAt !== undefined
          ? { botJoinedAt: args.botJoinedAt }
          : {}),
        updatedAt: now,
      })

      return existing._id
    }

    return await ctx.db.insert("guilds", {
      discordGuildId: args.discordGuildId,
      name: args.name,
      ...(args.iconUrl !== undefined ? { iconUrl: args.iconUrl } : {}),
      ...(args.ownerDiscordId !== undefined
        ? { ownerDiscordId: args.ownerDiscordId }
        : {}),
      ...(args.botJoinedAt !== undefined
        ? { botJoinedAt: args.botJoinedAt }
        : {}),
      createdAt: now,
      updatedAt: now,
    })
  },
})

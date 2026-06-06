import { ConvexError, v } from "convex/values"

import { internalMutation } from "../../../../_generated/server"

const MAX_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000

export const mark = internalMutation({
  args: {
    discordGuildId: v.string(),
    name: v.optional(v.string()),
    leftAt: v.optional(v.number()),
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

    const now = Date.now()
    const leftAt = normalizeLeftAt(args.leftAt, now)
    const latestPresenceAt = Math.max(
      guild.botJoinedAt ?? 0,
      guild.botInstallationVerifiedAt ?? 0,
      guild.lastSyncedAt ?? 0
    )

    if (leftAt <= latestPresenceAt) {
      return null
    }

    await ctx.db.patch(guild._id, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      botLeftAt: leftAt,
      lastSyncedAt: now,
      updatedAt: now,
    })

    return null
  },
})

function normalizeLeftAt(leftAt: number | undefined, now: number): number {
  if (leftAt === undefined) {
    return now
  }

  if (
    !Number.isSafeInteger(leftAt) ||
    leftAt < 0 ||
    leftAt > now + MAX_EVENT_CLOCK_SKEW_MS
  ) {
    throw new ConvexError({
      code: "INVALID_DISCORD_GUILD_EVENT_TIMESTAMP",
      message: "leftAt must be a valid non-future Discord guild event timestamp.",
    })
  }

  return leftAt
}

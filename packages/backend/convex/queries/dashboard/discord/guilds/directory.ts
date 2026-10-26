import { v } from "convex/values"
import { query } from "../../../../_generated/server"
import { getCurrentUser } from "../../../../lib/auth"
import {
  currentDiscordAccount,
  discordGuildRefresh,
  isFreshDiscordMembership,
} from "../../../../lib/discordGuildMemberships"

// Directory metadata is a last-known display, never permission to read configuration.
export const list = query({
  args: {},
  returns: v.object({
    status: v.union(
      v.literal("ready"),
      v.literal("pending"),
      v.literal("expired"),
      v.literal("unavailable"),
      v.literal("missingDiscord")
    ),
    guilds: v.array(
      v.object({
        discordGuildId: v.string(),
        name: v.string(),
        iconUrl: v.optional(v.string()),
        memberCount: v.optional(v.number()),
        lastOpenedAt: v.optional(v.number()),
        verifiedAt: v.optional(v.number()),
        verified: v.boolean(),
      })
    ),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user || user.status === "disabled")
      return { status: "unavailable" as const, guilds: [] }
    const account = await currentDiscordAccount(ctx, user._id)
    if (!account) return { status: "missingDiscord" as const, guilds: [] }
    const refresh = await discordGuildRefresh(ctx, account.providerAccountId)
    const memberships = await ctx.db
      .query("discordGuildMemberships")
      .withIndex("by_discord_user_id", (q) =>
        q.eq("discordUserId", account.providerAccountId)
      )
      .take(1000)
    const now = Date.now()
    const guilds = []
    for (const membership of memberships) {
      if (
        !membership.canManage ||
        membership.revokedAt !== undefined ||
        (membership.userId !== undefined && membership.userId !== user._id) ||
        (membership.managementVerifiedAt ?? 0) < account.createdAt
      )
        continue
      const guild = await ctx.db.get(membership.guildId)
      if (
        !guild ||
        guild.botLeftAt !== undefined ||
        (guild.botJoinedAt === undefined &&
          guild.botInstallationVerifiedAt === undefined)
      )
        continue
      guilds.push({
        discordGuildId: guild.discordGuildId,
        name: guild.name,
        ...(guild.iconUrl ? { iconUrl: guild.iconUrl } : {}),
        ...(guild.memberCount !== undefined
          ? { memberCount: guild.memberCount }
          : {}),
        ...(membership.lastOpenedAt !== undefined
          ? { lastOpenedAt: membership.lastOpenedAt }
          : {}),
        ...(membership.managementVerifiedAt !== undefined
          ? { verifiedAt: membership.managementVerifiedAt }
          : {}),
        verified: isFreshDiscordMembership(membership, account, refresh, now),
      })
    }
    const status =
      !refresh ||
      refresh.state === "failed" ||
      refresh.linkedAccountId !== account._id
        ? ("unavailable" as const)
        : refresh.state === "pending"
          ? ("pending" as const)
          : refresh.startedAt <= now - 300000
            ? ("expired" as const)
            : ("ready" as const)
    return {
      status,
      guilds: guilds.sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
})

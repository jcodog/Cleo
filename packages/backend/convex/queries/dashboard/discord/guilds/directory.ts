import { v } from "convex/values"
import { query } from "../../../../_generated/server"
import { getCurrentUser } from "../../../../lib/auth"
import {
  currentDiscordAccount,
  DISCORD_MANAGEMENT_TTL,
  discordGuildRefresh,
  isFreshDiscordMembership,
} from "../../../../lib/discordGuildMemberships"

/** Return same-account, nonrevoked display metadata without granting configuration access. */
export const list = query({
  args: {},
  returns: v.object({
    clerkUserId: v.union(v.string(), v.null()),
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
      return { status: "unavailable" as const, guilds: [], clerkUserId: null }
    const account = await currentDiscordAccount(ctx, user._id)
    if (!account)
      return {
        status: "missingDiscord" as const,
        guilds: [],
        clerkUserId: user.clerkUserId,
      }
    const refresh = await discordGuildRefresh(ctx, account.providerAccountId)
    const now = Date.now()
    const status =
      !refresh ||
      refresh.state === "failed" ||
      refresh.linkedAccountId !== account._id
        ? ("unavailable" as const)
        : refresh.state === "pending"
          ? ("pending" as const)
          : refresh.startedAt <= now - DISCORD_MANAGEMENT_TTL
            ? ("expired" as const)
            : ("ready" as const)
    const memberships = await ctx.db
      .query("discordGuildMemberships")
      .withIndex("by_discord_management", (q) => {
        const manageable = q
          .eq("discordUserId", account.providerAccountId)
          .eq("canManage", true)
        return status === "ready"
          ? manageable
              .gt("managementVerifiedAt", now - DISCORD_MANAGEMENT_TTL)
              .lte("managementVerifiedAt", now)
          : manageable.gte("managementVerifiedAt", account.createdAt)
      })
      .take(1000)
    const guilds = []
    for (const membership of memberships) {
      if (
        !membership.canManage ||
        membership.revokedAt !== undefined ||
        (membership.userId !== undefined && membership.userId !== user._id) ||
        (membership.managementVerifiedAt ?? 0) < account.createdAt ||
        (status === "ready" &&
          !isFreshDiscordMembership(membership, account, refresh, now))
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
    return {
      clerkUserId: user.clerkUserId,
      status,
      guilds: guilds.sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
})

import { v } from "convex/values"
import type { Doc, Id } from "../../../../_generated/dataModel"
import { query } from "../../../../_generated/server"
import { getCurrentUser } from "../../../../lib/auth"
import { shouldReplaceMembership } from "../../../../lib/discordGuildMemberships"
import { dashboardDiscordGuildSelectorViewModel } from "../../../../lib/validators"

export const list = query({
  args: {},
  returns: v.array(dashboardDiscordGuildSelectorViewModel),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return []
    }

    const discordAccount = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("provider"), "discord"))
      .first()

    const directMemberships = await ctx.db
      .query("discordGuildMemberships")
      .withIndex("by_user_id_and_guild_id", (q) => q.eq("userId", user._id))
      .collect()

    const discordMemberships = discordAccount
      ? await ctx.db
          .query("discordGuildMemberships")
          .withIndex("by_discord_user_id", (q) =>
            q.eq("discordUserId", discordAccount.providerAccountId)
          )
          .collect()
      : []

    const membershipsByGuildId = new Map<
      Id<"guilds">,
      Doc<"discordGuildMemberships">
    >()

    for (const membership of [...directMemberships, ...discordMemberships]) {
      const isDirectUserMembership = membership.userId === user._id
      const isDiscordIdentityMembership =
        discordAccount !== null &&
        membership.discordUserId === discordAccount.providerAccountId

      if (
        (!isDirectUserMembership && !isDiscordIdentityMembership) ||
        !membership.canManage ||
        membership.managementVerifiedAt === undefined ||
        membership.revokedAt !== undefined
      ) {
        continue
      }

      const existing = membershipsByGuildId.get(membership.guildId)

      if (
        !existing ||
        shouldReplaceMembership({
          existing,
          incoming: membership,
          incomingIsDirect: isDirectUserMembership,
          userId: user._id,
        })
      ) {
        membershipsByGuildId.set(membership.guildId, membership)
      }
    }

    const guilds = await Promise.all(
      Array.from(membershipsByGuildId.values()).map(async (membership) => {
        const guild = await ctx.db.get(membership.guildId)

        if (!guild || !isGuildInstalled(guild)) {
          return null
        }

        const lastSyncedAt = membership.lastSyncedAt ?? guild.lastSyncedAt

        return {
          guildId: guild._id,
          discordGuildId: guild.discordGuildId,
          name: guild.name,
          ...(guild.description !== undefined
            ? { description: guild.description }
            : {}),
          ...(guild.iconUrl !== undefined ? { iconUrl: guild.iconUrl } : {}),
          ...(guild.iconHash !== undefined ? { iconHash: guild.iconHash } : {}),
          ...(guild.memberCount !== undefined
            ? { memberCount: guild.memberCount }
            : {}),
          ...(guild.presenceCount !== undefined
            ? { presenceCount: guild.presenceCount }
            : {}),
          ...(guild.botJoinedAt !== undefined
            ? { botJoinedAt: guild.botJoinedAt }
            : {}),
          ...(guild.botInstallationVerifiedAt !== undefined
            ? { botInstallationVerifiedAt: guild.botInstallationVerifiedAt }
            : {}),
          ...(membership.isOwner !== undefined
            ? { isOwner: membership.isOwner }
            : {}),
          ...(membership.permissions !== undefined
            ? { permissions: membership.permissions }
            : {}),
          ...(membership.lastOpenedAt !== undefined
            ? { lastOpenedAt: membership.lastOpenedAt }
            : {}),
          ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
        }
      })
    )

    return guilds
      .filter(
        (guild): guild is Exclude<(typeof guilds)[number], null> =>
          guild !== null
      )
      .sort((left, right) => {
        const openedDelta = (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0)

        if (openedDelta !== 0) {
          return openedDelta
        }

        return left.name.localeCompare(right.name)
      })
  },
})

function isGuildInstalled(guild: {
  botJoinedAt?: number
  botInstallationVerifiedAt?: number
  botLeftAt?: number
}) {
  return (
    guild.botLeftAt === undefined &&
    (guild.botJoinedAt !== undefined ||
      guild.botInstallationVerifiedAt !== undefined)
  )
}

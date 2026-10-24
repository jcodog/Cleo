import { v } from "convex/values"
import { query } from "../../../../_generated/server"
import { getCurrentUser } from "../../../../lib/auth"
import {
  currentDiscordAccount,
  freshManageableMemberships,
} from "../../../../lib/discordGuildMemberships"
import { dashboardDiscordGuildSelectorViewModel } from "../../../../lib/validators"

export const list = query({
  args: {},
  returns: v.array(dashboardDiscordGuildSelectorViewModel),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return []
    }

    if (user.status === "disabled") return []
    const discordAccount = await currentDiscordAccount(ctx, user._id)
    if (!discordAccount) return []
    const memberships = await freshManageableMemberships(ctx, discordAccount)

    const guilds = await Promise.all(
      memberships.map(async (membership) => {
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

import { ConvexError, v, type Value } from "convex/values"
import type { Doc } from "../../../../_generated/dataModel"
import { query } from "../../../../_generated/server"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"
import { dashboardDiscordGuildOverviewResult } from "../../../../lib/validators"

export const get = query({
  args: {
    discordGuildId: v.string(),
  },
  returns: dashboardDiscordGuildOverviewResult,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return { status: "forbidden" as const }
    }

    if (user.status === "disabled") {
      return { status: "forbidden" as const }
    }

    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (!guild) {
      return { status: "notFound" as const }
    }

    const membership = await getGuildManagerMembership(ctx, guild._id)

    if (!membership) {
      return { status: "forbidden" as const }
    }

    const guildConfig = await ctx.db
      .query("guildConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()

    const overview = toGuildOverview(guild, membership, guildConfig)

    if (guild.botLeftAt !== undefined) {
      return {
        status: "botLeft" as const,
        overview,
      }
    }

    return {
      status: "ready" as const,
      overview,
    }
  },
})

async function getGuildManagerMembership(
  ctx: Parameters<typeof requireDiscordGuildManager>[0],
  guildId: Doc<"guilds">["_id"]
): Promise<Doc<"discordGuildMemberships"> | null> {
  try {
    return await requireDiscordGuildManager(ctx, guildId)
  } catch (error) {
    if (error instanceof ConvexError) {
      const code = getConvexErrorCode(error)

      if (
        code === "FORBIDDEN" ||
        code === "UNAUTHORIZED" ||
        code === "USER_DISABLED"
      ) {
        return null
      }
    }

    throw error
  }
}

function getConvexErrorCode(error: ConvexError<Value>): string | undefined {
  const data: unknown = error.data

  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
  ) {
    return data.code
  }

  return undefined
}

function toGuildOverview(
  guild: Doc<"guilds">,
  membership: Doc<"discordGuildMemberships">,
  guildConfig: Doc<"guildConfigs"> | null
) {
  const overviewMembership = {
    membershipId: membership._id,
    guildId: membership.guildId,
    ...(membership.userId !== undefined ? { userId: membership.userId } : {}),
    discordUserId: membership.discordUserId,
    ...(membership.isOwner !== undefined
      ? { isOwner: membership.isOwner }
      : {}),
    canManage: membership.canManage,
    ...(membership.managementVerifiedAt !== undefined
      ? { managementVerifiedAt: membership.managementVerifiedAt }
      : {}),
    ...(membership.managementVerificationSource !== undefined
      ? {
          managementVerificationSource: membership.managementVerificationSource,
        }
      : {}),
    ...(membership.permissions !== undefined
      ? { permissions: membership.permissions }
      : {}),
    ...(membership.lastSyncedAt !== undefined
      ? { lastSyncedAt: membership.lastSyncedAt }
      : {}),
  }

  const overviewConfig =
    guildConfig === null
      ? null
      : {
          guildConfigId: guildConfig._id,
          guildId: guildConfig.guildId,
          aiEnabled: guildConfig.aiEnabled,
          moderationEnabled: guildConfig.moderationEnabled,
          welcomeEnabled: guildConfig.welcomeEnabled,
          loggingEnabled: guildConfig.loggingEnabled,
          ...(guildConfig.logLevel !== undefined
            ? { logLevel: guildConfig.logLevel }
            : {}),
          ...(guildConfig.logChannelId !== undefined
            ? { logChannelId: guildConfig.logChannelId }
            : {}),
          ...(guildConfig.modLogChannelId !== undefined
            ? { modLogChannelId: guildConfig.modLogChannelId }
            : {}),
          ...(guildConfig.welcomeChannelId !== undefined
            ? { welcomeChannelId: guildConfig.welcomeChannelId }
            : {}),
          ...(guildConfig.updatesChannelId !== undefined
            ? { updatesChannelId: guildConfig.updatesChannelId }
            : {}),
          ...(guildConfig.announcementChannelId !== undefined
            ? { announcementChannelId: guildConfig.announcementChannelId }
            : {}),
          ...(guildConfig.commandPrefix !== undefined
            ? { commandPrefix: guildConfig.commandPrefix }
            : {}),
          updatedAt: guildConfig.updatedAt,
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
    ...(guild.botLeftAt !== undefined ? { botLeftAt: guild.botLeftAt } : {}),
    ...(guild.lastOpenedAt !== undefined
      ? { lastOpenedAt: guild.lastOpenedAt }
      : {}),
    ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
    membership: overviewMembership,
    guildConfig: overviewConfig,
  }
}

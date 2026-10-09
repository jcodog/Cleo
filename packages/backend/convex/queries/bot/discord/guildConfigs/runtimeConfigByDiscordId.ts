import { v } from "convex/values"

import { internalQuery } from "../../../../_generated/server"
import { botDiscordGuildRuntimeConfigResult } from "../../../../lib/botDiscordGuildRuntimeConfig"
import { getGuildAccess } from "../../../../lib/guildEntitlements"
import { FREE_WELCOME_STYLE } from "@workspace/shared/welcomeCard"

export const get = internalQuery({
  args: {
    discordGuildId: v.string(),
  },
  returns: botDiscordGuildRuntimeConfigResult,
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (!guild) {
      return {
        status: "disabled" as const,
        reason: "unknownGuild" as const,
      }
    }

    if (guild.botLeftAt !== undefined) {
      return {
        status: "disabled" as const,
        reason: "botLeft" as const,
      }
    }

    const config = await ctx.db
      .query("guildConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()

    if (!config) {
      return {
        status: "disabled" as const,
        reason: "missingConfig" as const,
      }
    }

    const live = await ctx.db
      .query("guildLiveNotificationConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()
    const access = await getGuildAccess(ctx, guild)
    const premiumWelcome = access.capabilities.includes(
      "guild.welcome.premium-style"
    )
    return {
      status: "ready" as const,
      config: {
        ...(config.welcomeStyle
          ? {
              welcomeStyle: premiumWelcome
                ? config.welcomeStyle
                : FREE_WELCOME_STYLE,
            }
          : {}),
        ...(premiumWelcome
          ? { premiumWelcomeValidUntil: access.validUntil }
          : {}),
        ...(live
          ? {
              liveNotificationsEnabled: live.liveNotificationsEnabled,
              liveNotificationMentionMode: live.liveNotificationMentionMode,
              ...(live.liveNotificationChannelId
                ? { liveNotificationChannelId: live.liveNotificationChannelId }
                : {}),
              ...(live.liveNotificationRoleId
                ? { liveNotificationRoleId: live.liveNotificationRoleId }
                : {}),
            }
          : {}),
        discordGuildId: guild.discordGuildId,
        moderationEnabled: config.moderationEnabled,
        welcomeEnabled: config.welcomeEnabled,
        loggingEnabled: config.loggingEnabled,
        supportEnabled: false,
        ...(config.logLevel !== undefined ? { logLevel: config.logLevel } : {}),
        ...(config.logChannelId !== undefined
          ? { logChannelId: config.logChannelId }
          : {}),
        ...(config.modLogChannelId !== undefined
          ? { modLogChannelId: config.modLogChannelId }
          : {}),
        ...(config.welcomeChannelId !== undefined
          ? { welcomeChannelId: config.welcomeChannelId }
          : {}),
        ...(config.welcomeSubtext !== undefined
          ? { welcomeSubtext: config.welcomeSubtext }
          : {}),
        ...(config.updatesChannelId !== undefined
          ? { updatesChannelId: config.updatesChannelId }
          : {}),
        ...(config.announcementChannelId !== undefined
          ? { announcementChannelId: config.announcementChannelId }
          : {}),
      },
    }
  },
})

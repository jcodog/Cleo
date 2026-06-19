import { v } from "convex/values"

import { internalQuery } from "../../../../_generated/server"
import { botDiscordGuildRuntimeConfigResult } from "../../../../lib/botDiscordGuildRuntimeConfig"

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

    return {
      status: "ready" as const,
      config: {
        discordGuildId: guild.discordGuildId,
        moderationEnabled: config.moderationEnabled,
        welcomeEnabled: config.welcomeEnabled,
        loggingEnabled: config.loggingEnabled,
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

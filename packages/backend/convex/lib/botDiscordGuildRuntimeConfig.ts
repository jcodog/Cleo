import {
  BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS,
  DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS,
} from "@workspace/shared/discordRuntimeConfig"
import { v } from "convex/values"

const [
  disabledUnknownGuild,
  disabledBotLeft,
  disabledMissingConfig,
] = BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS

const [logLevelNone, logLevelMinimal, logLevelMedium, logLevelMaximum] =
  DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS

const botDiscordGuildRuntimeConfigDisabledReason = v.union(
  v.literal(disabledUnknownGuild),
  v.literal(disabledBotLeft),
  v.literal(disabledMissingConfig)
)

const botDiscordGuildRuntimeConfigLogLevel = v.union(
  v.literal(logLevelNone),
  v.literal(logLevelMinimal),
  v.literal(logLevelMedium),
  v.literal(logLevelMaximum)
)

export const botDiscordGuildRuntimeConfig = v.object({
  discordGuildId: v.string(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  logLevel: v.optional(botDiscordGuildRuntimeConfigLogLevel),
  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),
  updatesChannelId: v.optional(v.string()),
  announcementChannelId: v.optional(v.string()),
})

export const botDiscordGuildRuntimeConfigResult = v.union(
  v.object({
    status: v.literal("ready"),
    config: botDiscordGuildRuntimeConfig,
  }),
  v.object({
    status: v.literal("disabled"),
    reason: botDiscordGuildRuntimeConfigDisabledReason,
  })
)

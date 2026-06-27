import {
  BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS,
  DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS,
  DISCORD_GUILD_SUPPORT_ESCALATION_POLICIES,
  DISCORD_GUILD_SUPPORT_TARGET_TYPES,
  DISCORD_GUILD_SUPPORT_TRANSCRIPT_POLICIES,
} from "@workspace/shared/discordRuntimeConfig"
import { v } from "convex/values"

const [disabledUnknownGuild, disabledBotLeft, disabledMissingConfig] =
  BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS

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

const botDiscordGuildSupportTargetType = v.union(
  ...DISCORD_GUILD_SUPPORT_TARGET_TYPES.map((value) => v.literal(value))
)

const botDiscordGuildSupportTranscriptPolicy = v.union(
  ...DISCORD_GUILD_SUPPORT_TRANSCRIPT_POLICIES.map((value) => v.literal(value))
)

const botDiscordGuildSupportEscalationPolicy = v.union(
  ...DISCORD_GUILD_SUPPORT_ESCALATION_POLICIES.map((value) => v.literal(value))
)

export const botDiscordGuildRuntimeConfig = v.object({
  discordGuildId: v.string(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  supportEnabled: v.boolean(),
  logLevel: v.optional(botDiscordGuildRuntimeConfigLogLevel),
  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),
  welcomeSubtext: v.optional(v.string()),
  updatesChannelId: v.optional(v.string()),
  announcementChannelId: v.optional(v.string()),
  supportStaffRoleIds: v.optional(v.array(v.string())),
  supportTargetId: v.optional(v.string()),
  supportTargetType: v.optional(botDiscordGuildSupportTargetType),
  supportTranscriptPolicy: v.optional(botDiscordGuildSupportTranscriptPolicy),
  supportEscalationPolicy: v.optional(botDiscordGuildSupportEscalationPolicy),
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

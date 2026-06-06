import { v } from "convex/values"

import { guildConfigLogLevel } from "./validators"

const botDiscordGuildRuntimeConfigDisabledReason = v.union(
  v.literal("unknownGuild"),
  v.literal("botLeft"),
  v.literal("missingConfig")
)

export const botDiscordGuildRuntimeConfig = v.object({
  discordGuildId: v.string(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  logLevel: v.optional(guildConfigLogLevel),
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

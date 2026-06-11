export const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/

export const DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS = [
  "none",
  "minimal",
  "medium",
  "maximum",
] as const

export const BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS = [
  "unknownGuild",
  "botLeft",
  "missingConfig",
] as const

export const LOCAL_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS = [
  "invalidGuildId",
  "convexUnavailable",
  "invalidBackendResponse",
] as const

export const DISCORD_GUILD_RUNTIME_CONFIG_REQUIRED_FIELD_NAMES = [
  "discordGuildId",
  "moderationEnabled",
  "welcomeEnabled",
  "loggingEnabled",
] as const

export const DISCORD_GUILD_RUNTIME_CONFIG_OPTIONAL_FIELD_NAMES = [
  "logLevel",
  "logChannelId",
  "modLogChannelId",
  "welcomeChannelId",
  "updatesChannelId",
  "announcementChannelId",
] as const

export const DISCORD_GUILD_RUNTIME_CONFIG_FIELD_NAMES = [
  ...DISCORD_GUILD_RUNTIME_CONFIG_REQUIRED_FIELD_NAMES,
  ...DISCORD_GUILD_RUNTIME_CONFIG_OPTIONAL_FIELD_NAMES,
] as const

export type DiscordGuildRuntimeConfigLogLevel =
  (typeof DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS)[number]

export type BackendDiscordGuildRuntimeConfigDisabledReason =
  (typeof BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS)[number]

export type LocalDiscordGuildRuntimeConfigDisabledReason =
  (typeof LOCAL_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS)[number]

export type DiscordGuildRuntimeConfigDisabledReason =
  | BackendDiscordGuildRuntimeConfigDisabledReason
  | LocalDiscordGuildRuntimeConfigDisabledReason

export type DiscordGuildRuntimeConfig = {
  discordGuildId: string
  moderationEnabled: boolean
  welcomeEnabled: boolean
  loggingEnabled: boolean
  logLevel?: DiscordGuildRuntimeConfigLogLevel
  logChannelId?: string
  modLogChannelId?: string
  welcomeChannelId?: string
  updatesChannelId?: string
  announcementChannelId?: string
}

export type BackendDiscordGuildRuntimeConfigResult =
  | {
      status: "ready"
      config: DiscordGuildRuntimeConfig
    }
  | {
      status: "disabled"
      reason: BackendDiscordGuildRuntimeConfigDisabledReason
    }

export type DiscordGuildRuntimeConfigResult =
  | {
      status: "ready"
      config: DiscordGuildRuntimeConfig
    }
  | {
      status: "disabled"
      reason: DiscordGuildRuntimeConfigDisabledReason
    }

export type RuntimeConfigValidationResult =
  | {
      success: true
      data: BackendDiscordGuildRuntimeConfigResult
    }
  | {
      success: false
      error: string
    }

export function isDiscordSnowflake(value: string): boolean {
  return DISCORD_SNOWFLAKE_PATTERN.test(value)
}

export function isBackendDiscordGuildRuntimeConfigDisabledReason(
  value: unknown
): value is BackendDiscordGuildRuntimeConfigDisabledReason {
  return (
    typeof value === "string" &&
    BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS.includes(
      value as BackendDiscordGuildRuntimeConfigDisabledReason
    )
  )
}

export function isDiscordGuildRuntimeConfigLogLevel(
  value: unknown
): value is DiscordGuildRuntimeConfigLogLevel {
  return (
    typeof value === "string" &&
    DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS.includes(
      value as DiscordGuildRuntimeConfigLogLevel
    )
  )
}

export function validateBackendDiscordGuildRuntimeConfigResult(
  value: unknown,
  expectedDiscordGuildId?: string
): RuntimeConfigValidationResult {
  if (!isRecord(value)) {
    return validationError("Runtime config result must be an object.")
  }

  if (value.status === "disabled") {
    if (!hasOnlyKeys(value, ["status", "reason"])) {
      return validationError("Disabled runtime config result has unknown fields.")
    }

    if (!isBackendDiscordGuildRuntimeConfigDisabledReason(value.reason)) {
      return validationError("Disabled runtime config result has invalid reason.")
    }

    return {
      success: true,
      data: {
        status: "disabled",
        reason: value.reason,
      },
    }
  }

  if (value.status !== "ready") {
    return validationError("Runtime config result has invalid status.")
  }

  if (!hasOnlyKeys(value, ["status", "config"])) {
    return validationError("Ready runtime config result has unknown fields.")
  }

  const configResult = validateDiscordGuildRuntimeConfig(
    value.config,
    expectedDiscordGuildId
  )

  if (!configResult.success) {
    return configResult
  }

  return {
    success: true,
    data: {
      status: "ready",
      config: configResult.data,
    },
  }
}

function validateDiscordGuildRuntimeConfig(
  value: unknown,
  expectedDiscordGuildId: string | undefined
):
  | {
      success: true
      data: DiscordGuildRuntimeConfig
    }
  | {
      success: false
      error: string
    } {
  if (!isRecord(value)) {
    return validationError("Runtime config must be an object.")
  }

  if (!hasOnlyKeys(value, DISCORD_GUILD_RUNTIME_CONFIG_FIELD_NAMES)) {
    return validationError("Runtime config has unknown fields.")
  }

  if (
    typeof value.discordGuildId !== "string" ||
    !isDiscordSnowflake(value.discordGuildId)
  ) {
    return validationError("Runtime config has invalid Discord guild ID.")
  }

  if (
    expectedDiscordGuildId !== undefined &&
    value.discordGuildId !== expectedDiscordGuildId
  ) {
    return validationError(
      "Runtime config returned a different Discord guild ID."
    )
  }

  const moderationEnabled = value.moderationEnabled
  const welcomeEnabled = value.welcomeEnabled
  const loggingEnabled = value.loggingEnabled

  if (typeof moderationEnabled !== "boolean") {
    return validationError("Runtime config has invalid moderationEnabled.")
  }

  if (typeof welcomeEnabled !== "boolean") {
    return validationError("Runtime config has invalid welcomeEnabled.")
  }

  if (typeof loggingEnabled !== "boolean") {
    return validationError("Runtime config has invalid loggingEnabled.")
  }

  const logLevel = value.logLevel

  if (
    logLevel !== undefined &&
    !isDiscordGuildRuntimeConfigLogLevel(logLevel)
  ) {
    return validationError("Runtime config has invalid log level.")
  }

  const logChannelId = validateOptionalDiscordSnowflake(
    "logChannelId",
    value.logChannelId
  )
  if (!logChannelId.success) {
    return logChannelId
  }

  const modLogChannelId = validateOptionalDiscordSnowflake(
    "modLogChannelId",
    value.modLogChannelId
  )
  if (!modLogChannelId.success) {
    return modLogChannelId
  }

  const welcomeChannelId = validateOptionalDiscordSnowflake(
    "welcomeChannelId",
    value.welcomeChannelId
  )
  if (!welcomeChannelId.success) {
    return welcomeChannelId
  }

  const updatesChannelId = validateOptionalDiscordSnowflake(
    "updatesChannelId",
    value.updatesChannelId
  )
  if (!updatesChannelId.success) {
    return updatesChannelId
  }

  const announcementChannelId = validateOptionalDiscordSnowflake(
    "announcementChannelId",
    value.announcementChannelId
  )
  if (!announcementChannelId.success) {
    return announcementChannelId
  }

  return {
    success: true,
    data: {
      discordGuildId: value.discordGuildId,
      moderationEnabled,
      welcomeEnabled,
      loggingEnabled,
      ...(logLevel !== undefined ? { logLevel } : {}),
      ...(logChannelId.data !== undefined
        ? { logChannelId: logChannelId.data }
        : {}),
      ...(modLogChannelId.data !== undefined
        ? { modLogChannelId: modLogChannelId.data }
        : {}),
      ...(welcomeChannelId.data !== undefined
        ? { welcomeChannelId: welcomeChannelId.data }
        : {}),
      ...(updatesChannelId.data !== undefined
        ? { updatesChannelId: updatesChannelId.data }
        : {}),
      ...(announcementChannelId.data !== undefined
        ? { announcementChannelId: announcementChannelId.data }
        : {}),
    },
  }
}

function validateOptionalDiscordSnowflake(
  fieldName: string,
  value: unknown
):
  | {
      success: true
      data?: string
    }
  | {
      success: false
      error: string
    } {
  if (value === undefined) {
    return { success: true }
  }

  if (typeof value !== "string" || !isDiscordSnowflake(value)) {
    return validationError(`Runtime config has invalid ${fieldName}.`)
  }

  return {
    success: true,
    data: value,
  }
}

function validationError(error: string): {
  success: false
  error: string
} {
  return {
    success: false,
    error,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key))
}

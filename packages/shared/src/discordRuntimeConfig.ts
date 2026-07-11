export const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/

export const DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS = [
  "none",
  "minimal",
  "medium",
  "maximum",
] as const

export const DISCORD_GUILD_SUPPORT_TARGET_TYPES = [
  "channel",
  "thread",
  "forum",
] as const

export const DISCORD_GUILD_SUPPORT_TRANSCRIPT_POLICIES = [
  "metadata-only",
  "explicit-messages",
] as const

export const DISCORD_GUILD_SUPPORT_ESCALATION_POLICIES = [
  "none",
  "jcn-product-only",
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
  "supportEnabled",
] as const

export const DISCORD_GUILD_RUNTIME_CONFIG_OPTIONAL_FIELD_NAMES = [
  "logLevel",
  "logChannelId",
  "modLogChannelId",
  "welcomeChannelId",
  "welcomeSubtext",
  "updatesChannelId",
  "announcementChannelId",
  "supportStaffRoleIds",
  "supportTargetId",
  "supportTargetType",
  "supportTranscriptPolicy",
  "supportEscalationPolicy",
] as const

export const DISCORD_GUILD_RUNTIME_CONFIG_FIELD_NAMES = [
  ...DISCORD_GUILD_RUNTIME_CONFIG_REQUIRED_FIELD_NAMES,
  ...DISCORD_GUILD_RUNTIME_CONFIG_OPTIONAL_FIELD_NAMES,
] as const

export type DiscordGuildRuntimeConfigLogLevel =
  (typeof DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS)[number]

export type DiscordGuildSupportTargetType =
  (typeof DISCORD_GUILD_SUPPORT_TARGET_TYPES)[number]

export type DiscordGuildSupportTranscriptPolicy =
  (typeof DISCORD_GUILD_SUPPORT_TRANSCRIPT_POLICIES)[number]

export type DiscordGuildSupportEscalationPolicy =
  (typeof DISCORD_GUILD_SUPPORT_ESCALATION_POLICIES)[number]

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
  supportEnabled: boolean
  logLevel?: DiscordGuildRuntimeConfigLogLevel
  logChannelId?: string
  modLogChannelId?: string
  welcomeChannelId?: string
  welcomeSubtext?: string
  updatesChannelId?: string
  announcementChannelId?: string
  supportStaffRoleIds?: string[]
  supportTargetId?: string
  supportTargetType?: DiscordGuildSupportTargetType
  supportTranscriptPolicy?: DiscordGuildSupportTranscriptPolicy
  supportEscalationPolicy?: DiscordGuildSupportEscalationPolicy
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

export function isDiscordGuildSupportTargetType(
  value: unknown
): value is DiscordGuildSupportTargetType {
  return (
    typeof value === "string" &&
    DISCORD_GUILD_SUPPORT_TARGET_TYPES.includes(
      value as DiscordGuildSupportTargetType
    )
  )
}

export function isDiscordGuildSupportTranscriptPolicy(
  value: unknown
): value is DiscordGuildSupportTranscriptPolicy {
  return (
    typeof value === "string" &&
    DISCORD_GUILD_SUPPORT_TRANSCRIPT_POLICIES.includes(
      value as DiscordGuildSupportTranscriptPolicy
    )
  )
}

export function isDiscordGuildSupportEscalationPolicy(
  value: unknown
): value is DiscordGuildSupportEscalationPolicy {
  return (
    typeof value === "string" &&
    DISCORD_GUILD_SUPPORT_ESCALATION_POLICIES.includes(
      value as DiscordGuildSupportEscalationPolicy
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
      return validationError(
        "Disabled runtime config result has unknown fields."
      )
    }

    if (!isBackendDiscordGuildRuntimeConfigDisabledReason(value.reason)) {
      return validationError(
        "Disabled runtime config result has invalid reason."
      )
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
  const supportEnabled = value.supportEnabled

  if (typeof moderationEnabled !== "boolean") {
    return validationError("Runtime config has invalid moderationEnabled.")
  }

  if (typeof welcomeEnabled !== "boolean") {
    return validationError("Runtime config has invalid welcomeEnabled.")
  }

  if (typeof loggingEnabled !== "boolean") {
    return validationError("Runtime config has invalid loggingEnabled.")
  }

  if (typeof supportEnabled !== "boolean") {
    return validationError("Runtime config has invalid supportEnabled.")
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

  const welcomeSubtext = validateOptionalText(
    "welcomeSubtext",
    value.welcomeSubtext
  )
  if (!welcomeSubtext.success) {
    return welcomeSubtext
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

  const supportStaffRoleIds = validateOptionalDiscordSnowflakeArray(
    "supportStaffRoleIds",
    value.supportStaffRoleIds
  )
  if (!supportStaffRoleIds.success) {
    return supportStaffRoleIds
  }

  const supportTargetId = validateOptionalDiscordSnowflake(
    "supportTargetId",
    value.supportTargetId
  )
  if (!supportTargetId.success) {
    return supportTargetId
  }

  const supportTargetType = value.supportTargetType
  if (
    supportTargetType !== undefined &&
    !isDiscordGuildSupportTargetType(supportTargetType)
  ) {
    return validationError("Runtime config has invalid support target type.")
  }

  const supportTranscriptPolicy = value.supportTranscriptPolicy
  if (
    supportTranscriptPolicy !== undefined &&
    !isDiscordGuildSupportTranscriptPolicy(supportTranscriptPolicy)
  ) {
    return validationError(
      "Runtime config has invalid support transcript policy."
    )
  }

  const supportEscalationPolicy = value.supportEscalationPolicy
  if (
    supportEscalationPolicy !== undefined &&
    !isDiscordGuildSupportEscalationPolicy(supportEscalationPolicy)
  ) {
    return validationError(
      "Runtime config has invalid support escalation policy."
    )
  }

  return {
    success: true,
    data: {
      discordGuildId: value.discordGuildId,
      moderationEnabled,
      welcomeEnabled,
      loggingEnabled,
      supportEnabled,
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
      ...(welcomeSubtext.data !== undefined
        ? { welcomeSubtext: welcomeSubtext.data }
        : {}),
      ...(updatesChannelId.data !== undefined
        ? { updatesChannelId: updatesChannelId.data }
        : {}),
      ...(announcementChannelId.data !== undefined
        ? { announcementChannelId: announcementChannelId.data }
        : {}),
      ...(supportStaffRoleIds.data !== undefined
        ? { supportStaffRoleIds: supportStaffRoleIds.data }
        : {}),
      ...(supportTargetId.data !== undefined
        ? { supportTargetId: supportTargetId.data }
        : {}),
      ...(supportTargetType !== undefined ? { supportTargetType } : {}),
      ...(supportTranscriptPolicy !== undefined
        ? { supportTranscriptPolicy }
        : {}),
      ...(supportEscalationPolicy !== undefined
        ? { supportEscalationPolicy }
        : {}),
    },
  }
}

function validateOptionalDiscordSnowflakeArray(
  fieldName: string,
  value: unknown
):
  | {
      success: true
      data?: string[]
    }
  | {
      success: false
      error: string
    } {
  if (value === undefined) {
    return { success: true }
  }

  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some(
      (item) => typeof item !== "string" || !isDiscordSnowflake(item)
    ) ||
    new Set(value).size !== value.length
  ) {
    return validationError(`Runtime config has invalid ${fieldName}.`)
  }

  return {
    success: true,
    data: value,
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

function validateOptionalText(
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

  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 120
  ) {
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

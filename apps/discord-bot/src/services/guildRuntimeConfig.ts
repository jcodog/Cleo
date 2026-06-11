import { convexBotClient } from "@/services/convexBotClient"
import { botLogError } from "@/utils/botLog"
import {
  isDiscordSnowflake,
  validateBackendDiscordGuildRuntimeConfigResult,
  type DiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigDisabledReason,
  type DiscordGuildRuntimeConfigResult,
} from "@workspace/shared/discordRuntimeConfig"

export type {
  DiscordGuildRuntimeConfig,
  DiscordGuildRuntimeConfigDisabledReason,
  DiscordGuildRuntimeConfigResult,
}

type RuntimeConfigValidationOptions = {
  discordGuildId: string
  backendResult: unknown | null
  onError?: (message: string, error?: unknown) => void
}

export async function fetchDiscordGuildRuntimeConfig(
  discordGuildId: string
): Promise<DiscordGuildRuntimeConfigResult> {
  if (!isDiscordSnowflake(discordGuildId)) {
    botLogError("Invalid Discord guild ID for runtime config fetch.")
    return disabledConfig("invalidGuildId")
  }

  const backendResult = await convexBotClient.fetchGuildRuntimeConfig(
    discordGuildId
  )

  return validateDiscordGuildRuntimeConfigBackendResult({
    discordGuildId,
    backendResult,
    onError: botLogError,
  })
}

export function validateDiscordGuildRuntimeConfigBackendResult({
  discordGuildId,
  backendResult,
  onError,
}: RuntimeConfigValidationOptions): DiscordGuildRuntimeConfigResult {
  if (!isDiscordSnowflake(discordGuildId)) {
    onError?.("Invalid Discord guild ID for runtime config fetch.")
    return disabledConfig("invalidGuildId")
  }

  if (backendResult === null) {
    return disabledConfig("convexUnavailable")
  }

  const parsedResult = validateBackendDiscordGuildRuntimeConfigResult(
    backendResult,
    discordGuildId
  )

  if (!parsedResult.success) {
    onError?.(
      "Invalid Convex guild runtime config response.",
      new Error(parsedResult.error)
    )
    return disabledConfig("invalidBackendResponse")
  }

  return parsedResult.data
}

function disabledConfig(
  reason: DiscordGuildRuntimeConfigDisabledReason
): DiscordGuildRuntimeConfigResult {
  return {
    status: "disabled",
    reason,
  }
}

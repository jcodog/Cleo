import { convexBotClient } from "@workspace/discord-bot/services/convexBotClient"
import { botLogError } from "@workspace/discord-bot/utils/botLog"
import { z } from "zod"

const discordSnowflakeSchema = z.string().regex(/^\d{17,20}$/)
const logLevelSchema = z.enum(["none", "minimal", "medium", "maximum"])

const optionalDiscordChannelIdSchema = discordSnowflakeSchema.optional()

const discordGuildRuntimeConfigSchema = z
  .object({
    discordGuildId: discordSnowflakeSchema,
    moderationEnabled: z.boolean(),
    welcomeEnabled: z.boolean(),
    loggingEnabled: z.boolean(),
    logLevel: logLevelSchema.optional(),
    logChannelId: optionalDiscordChannelIdSchema,
    modLogChannelId: optionalDiscordChannelIdSchema,
    welcomeChannelId: optionalDiscordChannelIdSchema,
    updatesChannelId: optionalDiscordChannelIdSchema,
    announcementChannelId: optionalDiscordChannelIdSchema,
  })
  .strict()

const backendDisabledReasonSchema = z.enum([
  "unknownGuild",
  "botLeft",
  "missingConfig",
])

const backendGuildRuntimeConfigResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ready"),
      config: discordGuildRuntimeConfigSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("disabled"),
      reason: backendDisabledReasonSchema,
    })
    .strict(),
])

export type DiscordGuildRuntimeConfig = z.infer<
  typeof discordGuildRuntimeConfigSchema
>

export type DiscordGuildRuntimeConfigDisabledReason =
  | "unknownGuild"
  | "botLeft"
  | "missingConfig"
  | "invalidGuildId"
  | "convexUnavailable"
  | "invalidBackendResponse"

export type DiscordGuildRuntimeConfigResult =
  | {
      status: "ready"
      config: DiscordGuildRuntimeConfig
    }
  | {
      status: "disabled"
      reason: DiscordGuildRuntimeConfigDisabledReason
    }

export async function fetchDiscordGuildRuntimeConfig(
  discordGuildId: string
): Promise<DiscordGuildRuntimeConfigResult> {
  const parsedGuildId = discordSnowflakeSchema.safeParse(discordGuildId)

  if (!parsedGuildId.success) {
    botLogError(
      "Invalid Discord guild ID for runtime config fetch.",
      parsedGuildId.error
    )
    return disabledConfig("invalidGuildId")
  }

  const backendResult = await convexBotClient.fetchGuildRuntimeConfig(
    parsedGuildId.data
  )

  if (backendResult === null) {
    return disabledConfig("convexUnavailable")
  }

  const parsedResult =
    backendGuildRuntimeConfigResultSchema.safeParse(backendResult)

  if (!parsedResult.success) {
    botLogError(
      "Invalid Convex guild runtime config response.",
      parsedResult.error
    )
    return disabledConfig("invalidBackendResponse")
  }

  if (
    parsedResult.data.status === "ready" &&
    parsedResult.data.config.discordGuildId !== parsedGuildId.data
  ) {
    botLogError("Convex returned runtime config for a different Discord guild.")
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

import { redactLogText } from "@workspace/logger"
import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"
import { ConvexError, v, type Infer } from "convex/values"

import {
  guildSupportEscalationPolicy,
  guildSupportTargetType,
  guildSupportTranscriptPolicy,
} from "../dbTables/guildSupportConfigs"

export const SUPPORT_MESSAGE_MAX_LENGTH = 1_000

export const openSupportTicketInput = v.object({
  requesterDiscordUserId: v.string(),
  discordGuildId: v.optional(v.string()),
  message: v.optional(v.string()),
})

const supportTicketRoute = v.object({
  targetId: v.string(),
  targetType: guildSupportTargetType,
  staffRoleIds: v.array(v.string()),
  threadId: v.optional(v.string()),
})

export const openSupportTicketResult = v.union(
  v.object({
    status: v.literal("guildSupportUnavailable"),
    reason: v.union(
      v.literal("notConfigured"),
      v.literal("disabled"),
      v.literal("unknownGuild"),
      v.literal("botLeft")
    ),
  }),
  v.object({
    status: v.union(v.literal("opened"), v.literal("resumed")),
    ticketId: v.id("supportTickets"),
    scope: v.union(v.literal("jcn"), v.literal("guild")),
    route: v.optional(supportTicketRoute),
    submittedMessage: v.optional(v.string()),
    messageStored: v.boolean(),
  })
)

export type OpenSupportTicketInput = Infer<typeof openSupportTicketInput>

export type GuildSupportConfigForRouting = {
  enabled: boolean
  staffRoleIds: string[]
  targetId?: string
  targetType: Infer<typeof guildSupportTargetType>
  transcriptPolicy: Infer<typeof guildSupportTranscriptPolicy>
  escalationPolicy: Infer<typeof guildSupportEscalationPolicy>
}

export function normalizeSupportTicketInput(
  input: OpenSupportTicketInput
): OpenSupportTicketInput {
  assertDiscordSnowflake("requesterDiscordUserId", input.requesterDiscordUserId)

  if (input.discordGuildId !== undefined) {
    assertDiscordSnowflake("discordGuildId", input.discordGuildId)
  }

  const message = normalizeSupportMessage(input.message)

  return {
    requesterDiscordUserId: input.requesterDiscordUserId,
    ...(input.discordGuildId !== undefined
      ? { discordGuildId: input.discordGuildId }
      : {}),
    ...(message !== undefined ? { message } : {}),
  }
}

export function normalizeSupportMessage(
  value: string | undefined
): string | undefined {
  const message = value?.trim()

  if (!message) {
    return undefined
  }

  if (message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
    throw new ConvexError({
      code: "SUPPORT_MESSAGE_TOO_LONG",
      message: `Support messages must be ${SUPPORT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    })
  }

  return redactLogText(message)
}

export function buildActiveSupportTicketKey(args: {
  requesterDiscordUserId: string
  discordGuildId?: string
}): string {
  return args.discordGuildId
    ? `guild:${args.discordGuildId}:${args.requesterDiscordUserId}`
    : `jcn:${args.requesterDiscordUserId}`
}

export function getGuildSupportUnavailableReason(
  config: GuildSupportConfigForRouting | null
): "notConfigured" | "disabled" | null {
  if (!config || !config.targetId || config.staffRoleIds.length === 0) {
    return "notConfigured"
  }

  return config.enabled ? null : "disabled"
}

function assertDiscordSnowflake(field: string, value: string): void {
  if (!isDiscordSnowflake(value)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_SNOWFLAKE",
      message: `${field} must be a valid Discord snowflake.`,
    })
  }
}

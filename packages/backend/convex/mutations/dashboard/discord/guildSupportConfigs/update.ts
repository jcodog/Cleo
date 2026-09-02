import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"
import { ConvexError, v } from "convex/values"

import { mutation } from "../../../../_generated/server"
import {
  guildSupportEscalationPolicy,
  guildSupportTargetType,
  guildSupportTranscriptPolicy,
} from "../../../../dbTables/guildSupportConfigs"
import { requireDiscordGuildManager } from "../../../../lib/auth"

const MAX_STAFF_ROLES = 20

const guildSupportConfigResult = v.object({
  supportConfigId: v.id("guildSupportConfigs"),
  enabled: v.boolean(),
  staffRoleIds: v.array(v.string()),
  targetId: v.optional(v.string()),
  targetType: guildSupportTargetType,
  transcriptPolicy: guildSupportTranscriptPolicy,
  escalationPolicy: guildSupportEscalationPolicy,
  updatedAt: v.number(),
})

export const update = mutation({
  args: {
    discordGuildId: v.string(),
    enabled: v.boolean(),
    staffRoleIds: v.array(v.string()),
    targetId: v.optional(v.union(v.string(), v.null())),
    targetType: guildSupportTargetType,
    transcriptPolicy: guildSupportTranscriptPolicy,
    escalationPolicy: guildSupportEscalationPolicy,
  },
  returns: guildSupportConfigResult,
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()

    if (!guild) {
      throw new ConvexError({
        code: "GUILD_NOT_FOUND",
        message: "Discord server was not found.",
      })
    }

    await requireDiscordGuildManager(ctx, guild._id)

    throw new ConvexError({
      code: "SUPPORT_CONFIGURATION_DISABLED",
      message:
        "Guild support configuration is temporarily disabled while support tickets are being rebuilt and tested.",
    })
  },
})

export function normalizeSupportStaffRoleIds(values: string[]): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean)

  if (
    normalized.length > MAX_STAFF_ROLES ||
    normalized.some((value) => !isDiscordSnowflake(value)) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new ConvexError({
      code: "INVALID_SUPPORT_STAFF_ROLES",
      message: `Support staff roles must contain at most ${MAX_STAFF_ROLES} unique Discord role IDs.`,
    })
  }

  return normalized
}

export function normalizeSupportTargetId(
  value: string | null | undefined
): string | undefined {
  const normalized = value?.trim()

  if (!normalized) {
    return undefined
  }

  if (!isDiscordSnowflake(normalized)) {
    throw new ConvexError({
      code: "INVALID_SUPPORT_TARGET",
      message: "The support destination must be a valid Discord ID.",
    })
  }

  return normalized
}

import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"
import { ConvexError, v } from "convex/values"

import { mutation } from "../../../../_generated/server"
import {
  guildSupportEscalationPolicy,
  guildSupportTargetType,
  guildSupportTranscriptPolicy,
} from "../../../../dbTables/guildSupportConfigs"
import {
  getCurrentUser,
  requireDiscordGuildManager,
} from "../../../../lib/auth"
import { insertDashboardGuildAuditEvent } from "../../../../lib/guildAudit"

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

    if (guild.botLeftAt !== undefined) {
      throw new ConvexError({
        code: "BOT_LEFT",
        message: "Cleo is not currently in this Discord server.",
      })
    }

    const staffRoleIds = normalizeSupportStaffRoleIds(args.staffRoleIds)
    const targetId = normalizeSupportTargetId(args.targetId)

    if (args.enabled && (!targetId || staffRoleIds.length === 0)) {
      throw new ConvexError({
        code: "INCOMPLETE_SUPPORT_ROUTING",
        message:
          "Enabled guild support requires a destination and at least one staff role.",
      })
    }

    const existing = await ctx.db
      .query("guildSupportConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()
    const now = Date.now()
    const next = {
      guildId: guild._id,
      enabled: args.enabled,
      staffRoleIds,
      ...(targetId ? { targetId } : {}),
      targetType: args.targetType,
      transcriptPolicy: args.transcriptPolicy,
      escalationPolicy: args.escalationPolicy,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const supportConfigId = existing
      ? (await ctx.db.replace(existing._id, next), existing._id)
      : await ctx.db.insert("guildSupportConfigs", next)
    const user = await getCurrentUser(ctx)

    await insertDashboardGuildAuditEvent(ctx, {
      guild,
      user,
      eventType: "dashboard.guild_support.updated",
      summary: args.enabled
        ? "Guild support routing enabled"
        : "Guild support routing disabled",
      metadata: {
        enabled: args.enabled,
        targetId: targetId ?? null,
        targetType: args.targetType,
        staffRoleIds,
        transcriptPolicy: args.transcriptPolicy,
        escalationPolicy: args.escalationPolicy,
      },
    })

    return {
      supportConfigId,
      enabled: args.enabled,
      staffRoleIds,
      ...(targetId ? { targetId } : {}),
      targetType: args.targetType,
      transcriptPolicy: args.transcriptPolicy,
      escalationPolicy: args.escalationPolicy,
      updatedAt: now,
    }
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

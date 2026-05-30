import { v } from "convex/values"

import type { Doc, Id } from "../../../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../../../_generated/server"
import { discordVerificationSource } from "../../../../dbTables/shared"
import { insertDashboardGuildAuditEvent } from "../../../../lib/guildAudit"
import { guildDoc } from "../../../../lib/validators"

const maybeString = v.optional(v.string())
const maybeNumber = v.optional(v.number())

export const upsert = internalMutation({
  args: {
    discordGuildId: v.string(),
    name: v.string(),
    description: maybeString,
    iconUrl: maybeString,
    iconHash: maybeString,
    ownerDiscordId: maybeString,
    memberCount: maybeNumber,
    presenceCount: maybeNumber,
    botInstallationVerifiedAt: v.number(),
    userId: v.id("users"),
    discordUserId: v.string(),
    isOwner: v.optional(v.boolean()),
    canManage: v.boolean(),
    managementVerifiedAt: v.number(),
    managementVerificationSource: discordVerificationSource,
    permissions: maybeString,
    lastSyncedAt: v.number(),
  },
  returns: guildDoc,
  handler: async (ctx, args) => {
    const now = Date.now()
    const guild = await upsertGuild(ctx, args, now)

    await upsertMembership(ctx, guild._id, args, now)
    await ensureGuildConfig(ctx, guild._id, now)
    await completeMatchingInstallSessions(ctx, args, now)
    await insertDashboardGuildAuditEvent(ctx, {
      guild,
      user: await ctx.db.get(args.userId),
      eventType: "dashboard.server_install.rest_verified",
      summary: "Dashboard verified Cleo install through Discord REST",
      metadata: {
        discordGuildId: args.discordGuildId,
        verificationSource: "discord-rest",
      },
      occurredAt: args.botInstallationVerifiedAt,
    })

    return guild
  },
})

async function upsertGuild(
  ctx: MutationCtx,
  args: {
    discordGuildId: string
    name: string
    description?: string
    iconUrl?: string
    iconHash?: string
    ownerDiscordId?: string
    memberCount?: number
    presenceCount?: number
    botInstallationVerifiedAt: number
    lastSyncedAt: number
  },
  now: number
): Promise<Doc<"guilds">> {
  const existing = await ctx.db
    .query("guilds")
    .withIndex("by_discord_guild_id", (q) =>
      q.eq("discordGuildId", args.discordGuildId)
    )
    .unique()

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: args.name,
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.iconUrl !== undefined ? { iconUrl: args.iconUrl } : {}),
      ...(args.iconHash !== undefined ? { iconHash: args.iconHash } : {}),
      ...(args.ownerDiscordId !== undefined
        ? { ownerDiscordId: args.ownerDiscordId }
        : {}),
      ...(args.memberCount !== undefined ? { memberCount: args.memberCount } : {}),
      ...(args.presenceCount !== undefined
        ? { presenceCount: args.presenceCount }
        : {}),
      botInstallationVerifiedAt: args.botInstallationVerifiedAt,
      botLeftAt: undefined,
      lastSyncedAt: args.lastSyncedAt,
      updatedAt: now,
    })

    const updated = await ctx.db.get(existing._id)

    if (!updated) {
      throw new Error("Guild could not be loaded after REST verification.")
    }

    return updated
  }

  const guildId = await ctx.db.insert("guilds", {
    discordGuildId: args.discordGuildId,
    name: args.name,
    ...(args.description !== undefined
      ? { description: args.description }
      : {}),
    ...(args.iconUrl !== undefined ? { iconUrl: args.iconUrl } : {}),
    ...(args.iconHash !== undefined ? { iconHash: args.iconHash } : {}),
    ...(args.ownerDiscordId !== undefined
      ? { ownerDiscordId: args.ownerDiscordId }
      : {}),
    ...(args.memberCount !== undefined ? { memberCount: args.memberCount } : {}),
    ...(args.presenceCount !== undefined
      ? { presenceCount: args.presenceCount }
      : {}),
    botInstallationVerifiedAt: args.botInstallationVerifiedAt,
    lastSyncedAt: args.lastSyncedAt,
    createdAt: now,
    updatedAt: now,
  })

  const guild = await ctx.db.get(guildId)

  if (!guild) {
    throw new Error("Guild could not be loaded after REST verification.")
  }

  return guild
}

async function upsertMembership(
  ctx: MutationCtx,
  guildId: Id<"guilds">,
  args: {
    userId: Id<"users">
    discordUserId: string
    isOwner?: boolean
    canManage: boolean
    managementVerifiedAt: number
    managementVerificationSource: "discord-bot" | "discord-oauth" | "manual"
    permissions?: string
    lastSyncedAt: number
  },
  now: number
) {
  const existing = await ctx.db
    .query("discordGuildMemberships")
    .withIndex("by_guild_id_and_discord_user_id", (q) =>
      q.eq("guildId", guildId).eq("discordUserId", args.discordUserId)
    )
    .unique()

  const value = {
    guildId,
    userId: args.userId,
    discordUserId: args.discordUserId,
    ...(args.isOwner !== undefined ? { isOwner: args.isOwner } : {}),
    canManage: args.canManage,
    managementVerifiedAt: args.managementVerifiedAt,
    managementVerificationSource: args.managementVerificationSource,
    ...(args.permissions !== undefined ? { permissions: args.permissions } : {}),
    lastSyncedAt: args.lastSyncedAt,
    updatedAt: now,
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...value,
      revokedAt: undefined,
    })
    return
  }

  await ctx.db.insert("discordGuildMemberships", {
    ...value,
    createdAt: now,
  })
}

async function ensureGuildConfig(
  ctx: MutationCtx,
  guildId: Id<"guilds">,
  now: number
) {
  const existing = await ctx.db
    .query("guildConfigs")
    .withIndex("by_guild_id", (q) => q.eq("guildId", guildId))
    .unique()

  if (existing) {
    return
  }

  await ctx.db.insert("guildConfigs", {
    guildId,
    aiEnabled: true,
    moderationEnabled: false,
    welcomeEnabled: false,
    loggingEnabled: false,
    commandPrefix: "/",
    createdAt: now,
    updatedAt: now,
  })
}

async function completeMatchingInstallSessions(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">
    discordUserId: string
    discordGuildId: string
  },
  now: number
) {
  const sessions = await ctx.db
    .query("discordGuildInstallSessions")
    .withIndex("by_discord_guild_id", (q) =>
      q.eq("discordGuildId", args.discordGuildId)
    )
    .collect()

  for (const session of sessions) {
    if (
      session.userId !== args.userId ||
      session.discordUserId !== args.discordUserId ||
      session.expiresAt <= now ||
      (session.status !== "pending" && session.status !== "bot_joined")
    ) {
      continue
    }

    await ctx.db.patch(session._id, {
      status: "configured",
      completedAt: now,
      updatedAt: now,
    })
  }
}

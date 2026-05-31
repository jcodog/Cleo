import { v } from "convex/values"
import type { Id } from "../../../../_generated/dataModel"
import { internalMutation } from "../../../../_generated/server"
import { discordVerificationSource } from "../../../../dbTables/shared"

export const upsert = internalMutation({
  args: {
    guildId: v.id("guilds"),
    userId: v.optional(v.id("users")),
    discordUserId: v.string(),
    isOwner: v.optional(v.boolean()),
    canManage: v.boolean(),
    managementVerifiedAt: v.number(),
    managementVerificationSource: discordVerificationSource,
    permissions: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
  },
  returns: v.id("discordGuildMemberships"),
  handler: async (ctx, args): Promise<Id<"discordGuildMemberships">> => {
    const now = Date.now()
    const existing = await ctx.db
      .query("discordGuildMemberships")
      .withIndex("by_guild_id_and_discord_user_id", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", args.discordUserId)
      )
      .unique()

    const value = {
      guildId: args.guildId,
      ...(args.userId !== undefined ? { userId: args.userId } : {}),
      discordUserId: args.discordUserId,
      ...(args.isOwner !== undefined ? { isOwner: args.isOwner } : {}),
      canManage: args.canManage,
      managementVerifiedAt: args.managementVerifiedAt,
      managementVerificationSource: args.managementVerificationSource,
      ...(args.permissions !== undefined
        ? { permissions: args.permissions }
        : {}),
      lastSyncedAt: args.lastSyncedAt ?? now,
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...value,
        revokedAt: undefined,
      })
      return existing._id
    }

    return await ctx.db.insert("discordGuildMemberships", {
      ...value,
      createdAt: now,
    })
  },
})

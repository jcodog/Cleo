import { defineTable } from "convex/server"
import { v } from "convex/values"
import { discordVerificationSource } from "./shared"

export const discordGuildMemberships = defineTable({
  guildId: v.id("guilds"),
  userId: v.optional(v.id("users")),
  discordUserId: v.string(),

  isOwner: v.optional(v.boolean()),
  canManage: v.boolean(),
  managementVerifiedAt: v.optional(v.number()),
  managementVerificationSource: v.optional(discordVerificationSource),
  permissions: v.optional(v.string()),

  revokedAt: v.optional(v.number()),

  lastOpenedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_guild_id", ["guildId"])
  .index("by_user_id", ["userId"])
  .index("by_discord_user_id", ["discordUserId"])
  .index("by_guild_id_and_discord_user_id", ["guildId", "discordUserId"])
  .index("by_user_id_and_guild_id", ["userId", "guildId"])
  .index("by_discord_management", [
    "discordUserId",
    "canManage",
    "managementVerifiedAt",
  ])

export const discordGuildEvidence = v.object({
  id: v.string(),
  owner: v.optional(v.boolean()),
  permissions: v.optional(v.string()),
})

export const discordGuildRefreshes = defineTable({
  discordUserId: v.string(),
  userId: v.id("users"),
  linkedAccountId: v.id("linkedAccounts"),
  revision: v.number(),
  startedAt: v.number(),
  state: v.union(
    v.literal("pending"),
    v.literal("complete"),
    v.literal("failed")
  ),
  phase: v.union(v.literal("existing"), v.literal("incoming")),
  cursor: v.optional(v.string()),
  offset: v.number(),
  guilds: v.array(discordGuildEvidence),
  reconciliation: v.boolean(),
}).index("by_discord_user", ["discordUserId"])

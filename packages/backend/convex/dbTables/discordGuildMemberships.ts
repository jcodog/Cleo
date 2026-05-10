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

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_guild_id", ["guildId"])
  .index("by_user_id", ["userId"])
  .index("by_discord_user_id", ["discordUserId"])
  .index("by_guild_id_and_discord_user_id", ["guildId", "discordUserId"])

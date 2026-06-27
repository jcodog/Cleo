import { defineTable } from "convex/server"
import { v } from "convex/values"

export const supportTicketScope = v.union(v.literal("jcn"), v.literal("guild"))

export const supportTicketStatus = v.union(
  v.literal("open"),
  v.literal("waiting-on-requester"),
  v.literal("waiting-on-staff"),
  v.literal("resolved"),
  v.literal("closed")
)

export const supportTickets = defineTable({
  scope: supportTicketScope,
  status: supportTicketStatus,
  activeKey: v.optional(v.string()),
  requesterUserId: v.optional(v.id("users")),
  requesterDiscordUserId: v.string(),
  guildId: v.optional(v.id("guilds")),
  discordGuildId: v.optional(v.string()),
  routingTargetId: v.optional(v.string()),
  routingTargetType: v.optional(
    v.union(v.literal("channel"), v.literal("thread"), v.literal("forum"))
  ),
  transcriptPolicy: v.union(
    v.literal("metadata-only"),
    v.literal("explicit-messages")
  ),
  escalationPolicy: v.union(v.literal("none"), v.literal("jcn-product-only")),
  source: v.literal("discord-help"),
  openCount: v.number(),
  lastOpenedAt: v.number(),
  lastActivityAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  resolvedAt: v.optional(v.number()),
  closedAt: v.optional(v.number()),
})
  .index("by_active_key", ["activeKey"])
  .index("by_scope_and_updated_at", ["scope", "updatedAt"])
  .index("by_guild_id_and_updated_at", ["guildId", "updatedAt"])
  .index("by_requester_discord_user_id_and_updated_at", [
    "requesterDiscordUserId",
    "updatedAt",
  ])

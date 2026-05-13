import { v } from "convex/values"

export const userDoc = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  clerkUserId: v.string(),
  email: v.string(),
  displayName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  role: v.union(
    v.literal("user"),
    v.literal("staff"),
    v.literal("admin"),
    v.literal("superadmin")
  ),
  status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const linkedAccountDoc = v.object({
  _id: v.id("linkedAccounts"),
  _creationTime: v.number(),
  userId: v.id("users"),
  provider: v.union(
    v.literal("discord"),
    v.literal("kick"),
    v.literal("twitch"),
    v.literal("github")
  ),
  providerAccountId: v.string(),
  username: v.optional(v.string()),
  displayName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  scopes: v.array(v.string()),
  accessTokenSecretId: v.optional(v.string()),
  refreshTokenSecretId: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const guildDoc = v.object({
  _id: v.id("guilds"),
  _creationTime: v.number(),
  discordGuildId: v.string(),
  name: v.string(),
  iconUrl: v.optional(v.string()),
  ownerDiscordId: v.optional(v.string()),
  botJoinedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const guildConfigDoc = v.object({
  _id: v.id("guildConfigs"),
  _creationTime: v.number(),
  guildId: v.id("guilds"),
  aiEnabled: v.boolean(),
  moderationEnabled: v.boolean(),
  welcomeEnabled: v.boolean(),
  loggingEnabled: v.boolean(),
  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  welcomeChannelId: v.optional(v.string()),
  commandPrefix: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const discordGuildMembershipDoc = v.object({
  _id: v.id("discordGuildMemberships"),
  _creationTime: v.number(),
  guildId: v.id("guilds"),
  userId: v.optional(v.id("users")),
  discordUserId: v.string(),
  isOwner: v.optional(v.boolean()),
  canManage: v.boolean(),
  managementVerifiedAt: v.optional(v.number()),
  managementVerificationSource: v.optional(
    v.union(
      v.literal("discord-bot"),
      v.literal("discord-oauth"),
      v.literal("manual")
    )
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})

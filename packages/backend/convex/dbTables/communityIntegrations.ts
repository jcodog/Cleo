import { defineTable } from "convex/server"
import { v } from "convex/values"

export const moderationPlatform = v.union(
  v.literal("discord"),
  v.literal("twitch")
)
const policyFields = {
  scopeId: v.string(),
  userId: v.id("users"),
  policyJSON: v.string(),
  revision: v.number(),
  enforcement: v.boolean(),
  updatedAt: v.number(),
  health: v.optional(v.string()),
  worker: v.optional(v.string()),
  leaseUntil: v.optional(v.number()),
}
export const discordModerationPolicies = defineTable(policyFields)
  .index("by_scope", ["scopeId"])
  .index("by_updated", ["updatedAt"])
export const twitchModerationPolicies = defineTable(policyFields)
  .index("by_scope", ["scopeId"])
  .index("by_updated", ["updatedAt"])
export const discordUserInstallations = defineTable({
  discordUserId: v.string(),
  state: v.union(
    v.literal("active"),
    v.literal("uncertain"),
    v.literal("revoked")
  ),
  evidenceAt: v.number(),
  expiresAt: v.number(),
  eventKey: v.string(),
}).index("by_discord_user", ["discordUserId"])
export const discordConnectionSessions = defineTable({
  userId: v.id("users"),
  discordUserId: v.string(),
  stateHash: v.string(),
  purpose: v.union(v.literal("install"), v.literal("roles")),
  expiresAt: v.number(),
  consumed: v.boolean(),
})
  .index("by_state", ["stateHash"])
  .index("by_user", ["userId"])
export const discordRoleConnections = defineTable({
  userId: v.id("users"),
  discordUserId: v.string(),
  encryptedTokens: v.string(),
  expiresAt: v.number(),
  revision: v.number(),
  revokedAt: v.optional(v.number()),
  leaseUntil: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_updated", ["updatedAt"])
  .index("by_active_due", ["revokedAt", "updatedAt"])
export const communityRoleJobs = defineTable({
  discordUserId: v.string(),
  revision: v.number(),
  attemptedRevision: v.optional(v.number()),
  leaseUntil: v.number(),
  worker: v.optional(v.string()),
  attempts: v.number(),
  nextAt: v.number(),
})
  .index("by_user", ["discordUserId"])
  .index("by_due", ["nextAt"])
export const communityPreferences = defineTable({
  guildId: v.id("guilds"),
  publishIdentity: v.boolean(),
  revision: v.number(),
  updatedAt: v.number(),
}).index("by_guild", ["guildId"])
export const premiumCheckouts = defineTable({
  guildId: v.id("guilds"),
  userId: v.id("users"),
  discordUserId: v.string(),
  purchaserKind: v.union(v.literal("owner"), v.literal("administrator")),
  announce: v.boolean(),
  displayRole: v.boolean(),
  key: v.string(),
  sessionId: v.optional(v.string()),
  url: v.optional(v.string()),
  closedAt: v.optional(v.number()),
  creationStartedAt: v.optional(v.number()),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index("by_guild", ["guildId"])
  .index("by_key", ["key"])
  .index("by_user_open", ["userId", "closedAt"])
export const paidCommunityActivations = defineTable({
  subscriptionId: v.string(),
  guildId: v.id("guilds"),
  userId: v.id("users"),
  discordUserId: v.string(),
  purchaserKind: v.union(v.literal("owner"), v.literal("administrator")),
  announce: v.boolean(),
  displayRole: v.boolean(),
  paidUntil: v.number(),
  revoked: v.boolean(),
  firstPaidInvoiceId: v.string(),
  updatedAt: v.number(),
  testMode: v.boolean(),
})
  .index("by_subscription", ["subscriptionId"])
  .index("by_user", ["userId"])
  .index("by_guild", ["guildId"])
  .index("by_guild_active_end", ["guildId", "revoked", "paidUntil"])
  .index("by_user_recognition", [
    "userId",
    "discordUserId",
    "revoked",
    "testMode",
    "displayRole",
    "paidUntil",
  ])
export const communityAnnouncementOutbox = defineTable({
  activationId: v.id("paidCommunityActivations"),
  key: v.string(),
  state: v.union(
    v.literal("pending"),
    v.literal("sending"),
    v.literal("sent"),
    v.literal("uncertain"),
    v.literal("investigation"),
    v.literal("suppressed")
  ),
  messageId: v.optional(v.string()),
  attempt: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index("by_key", ["key"])
  .index("by_state", ["state"])
  .index("by_state_updated", ["state", "updatedAt"])
export const integrationReceipts = defineTable({
  provider: v.string(),
  key: v.string(),
  createdAt: v.number(),
})
  .index("by_provider_key", ["provider", "key"])
  .index("by_created", ["createdAt"])
export const communityPayments = defineTable({
  invoiceId: v.string(),
  subscriptionId: v.string(),
  paymentIntentId: v.optional(v.string()),
  chargeId: v.optional(v.string()),
})
  .index("by_invoice", ["invoiceId"])
  .index("by_payment_intent", ["paymentIntentId"])
  .index("by_charge", ["chargeId"])
export const stripeReconciliationLocks = defineTable({
  subscriptionId: v.string(),
  worker: v.string(),
  leaseUntil: v.number(),
}).index("by_subscription", ["subscriptionId"])

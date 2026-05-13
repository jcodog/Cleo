import { defineTable } from "convex/server"
import { v } from "convex/values"
import { linkedProvider } from "./shared"

export const linkedAccounts = defineTable({
  userId: v.id("users"),
  provider: linkedProvider,
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
  .index("by_user_id", ["userId"])
  .index("by_provider_and_provider_account_id", [
    "provider",
    "providerAccountId",
  ])

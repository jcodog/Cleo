import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { queueRoleSync } from "./lib/cleoRoleEligibility"
import { roleConnectionDoc } from "./lib/communityValidators"
const purpose = v.union(v.literal("install"), v.literal("roles"))
export const begin = internalMutation({
  args: {
    userId: v.id("users"),
    discordUserId: v.string(),
    stateHash: v.string(),
    purpose,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("discordConnectionSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(20)
    for (const row of old) await ctx.db.delete(row._id)
    await ctx.db.insert("discordConnectionSessions", {
      ...args,
      consumed: false,
      expiresAt: Date.now() + 300000,
    })
    return null
  },
})
export const consume = internalMutation({
  args: { userId: v.id("users"), stateHash: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("discordConnectionSessions")
      .withIndex("by_state", (q) => q.eq("stateHash", args.stateHash))
      .unique()
    if (
      !row ||
      row.userId !== args.userId ||
      row.purpose !== "roles" ||
      row.consumed ||
      row.expiresAt <= Date.now()
    )
      throw new Error("Invalid or expired Discord verification state.")
    const linked = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", row.userId).eq("provider", "discord")
      )
      .take(2)
    if (
      linked.length !== 1 ||
      linked[0]?.providerAccountId !== row.discordUserId
    )
      throw new Error("Discord identity changed. Start verification again.")
    await ctx.db.patch(row._id, { consumed: true })
    return row.discordUserId
  },
})
export const storeTokens = internalMutation({
  args: {
    userId: v.id("users"),
    discordUserId: v.string(),
    encryptedTokens: v.string(),
    expiresAt: v.number(),
    expectedRevision: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("discordRoleConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    const linked = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", "discord")
      )
      .take(2)
    if (
      linked.length !== 1 ||
      linked[0]?.providerAccountId !== args.discordUserId ||
      (args.expectedRevision !== undefined &&
        current?.revision !== args.expectedRevision)
    )
      throw new Error("Discord connection changed.")
    const value = {
      userId: args.userId,
      discordUserId: args.discordUserId,
      encryptedTokens: args.encryptedTokens,
      expiresAt: args.expiresAt,
      revision: (current?.revision ?? 0) + 1,
      leaseUntil:
        args.expectedRevision === undefined ? 0 : (current?.leaseUntil ?? 0),
      updatedAt: Date.now(),
      revokedAt: undefined,
    }
    if (current) await ctx.db.patch(current._id, value)
    else await ctx.db.insert("discordRoleConnections", value)
    await queueRoleSync(ctx, args.discordUserId)
    return null
  },
})
export const connection = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(roleConnectionDoc, v.null()),
  handler: async (ctx, args) =>
    ctx.db
      .query("discordRoleConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique(),
})
export const revoke = internalMutation({
  args: { userId: v.id("users"), expectedRevision: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("discordRoleConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (
      current &&
      (args.expectedRevision === undefined ||
        current.revision === args.expectedRevision)
    ) {
      await ctx.db.patch(current._id, {
        encryptedTokens: "",
        revokedAt: Date.now(),
        revision: current.revision + 1,
      })
      await queueRoleSync(ctx, current.discordUserId)
    }
    return null
  },
})
export const lease = internalMutation({
  args: { userId: v.id("users") },
  returns: v.union(roleConnectionDoc, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("discordRoleConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (!row || row.revokedAt || (row.leaseUntil ?? 0) > Date.now()) return null
    await ctx.db.patch(row._id, { leaseUntil: Date.now() + 60000 })
    return row
  },
})
export const release = internalMutation({
  args: { userId: v.id("users"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("discordRoleConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (row?.revision === args.revision)
      await ctx.db.patch(row._id, { leaseUntil: 0, updatedAt: Date.now() })
    return null
  },
})
export const reconcile = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("discordRoleConnections")
      .withIndex("by_active_due", (q) =>
        q.eq("revokedAt", undefined).lte("updatedAt", Date.now() - 300000)
      )
      .take(100)
    for (const row of rows) {
      await ctx.db.patch(row._id, { updatedAt: Date.now() })
      await ctx.scheduler.runAfter(
        0,
        internal.communityActions.publishLinkedRoles,
        { userId: row.userId }
      )
    }
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.discordConnections.reconcile, {
        cursor: args.cursor,
      })
    return null
  },
})
export const installation = internalMutation({
  args: {
    discordUserId: v.string(),
    state: v.union(
      v.literal("active"),
      v.literal("uncertain"),
      v.literal("revoked")
    ),
    evidenceAt: v.number(),
    eventKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("discordUserInstallations")
      .withIndex("by_discord_user", (q) =>
        q.eq("discordUserId", args.discordUserId)
      )
      .unique()
    if (
      args.evidenceAt > Date.now() + 5000 ||
      (row &&
        (row.evidenceAt > args.evidenceAt ||
          (row.evidenceAt === args.evidenceAt &&
            !(row.state === "active" && args.state !== "active"))))
    )
      return null
    const receipt = await ctx.db
      .query("integrationReceipts")
      .withIndex("by_provider_key", (q) =>
        q.eq("provider", "discord").eq("key", args.eventKey)
      )
      .unique()
    if (receipt) return null
    await ctx.db.insert("integrationReceipts", {
      provider: "discord",
      key: args.eventKey,
      createdAt: Date.now(),
    })
    const value = { ...args, expiresAt: args.evidenceAt + 86400000 }
    if (row) await ctx.db.patch(row._id, value)
    else await ctx.db.insert("discordUserInstallations", value)
    await queueRoleSync(ctx, args.discordUserId)
    return null
  },
})

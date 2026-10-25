import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { query, mutation, internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import { getCurrentUser, requireAdmin } from "./lib/auth"
import { currentDiscordAccount } from "./lib/discordGuildMemberships"
import { queueRoleSync } from "./lib/cleoRoleEligibility"
import { communityTestRole } from "./dbTables/communityIntegrations"

export const access = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    return (
      !!user &&
      user.status !== "disabled" &&
      ["admin", "superadmin"].includes(user.role)
    )
  },
})
export const users = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const page = await ctx.db
      .query("users")
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(50, args.paginationOpts.numItems),
      })
    return {
      ...page,
      page: page.page.map((user) => ({
        id: user._id,
        name: user.displayName ?? user.email,
        disabled: user.status === "disabled",
      })),
    }
  },
})
export const current = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const grant = await ctx.db
      .query("communityRoleTestGrants")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first()
    const account = await currentDiscordAccount(ctx, args.userId)
    return grant &&
      grant.revokedAt === undefined &&
      grant.expiresAt > Date.now() &&
      account?._id === grant.linkedAccountId &&
      account.providerAccountId === grant.discordUserId
      ? { roles: grant.roles, expiresAt: grant.expiresAt, reason: grant.reason }
      : null
  },
})
export const set = mutation({
  args: {
    userId: v.id("users"),
    roles: v.array(communityTestRole),
    hours: v.number(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx)
    const user = await ctx.db.get(args.userId)
    const account = await currentDiscordAccount(ctx, args.userId)
    if (!user || user.status === "disabled" || !account)
      throw new Error(
        "An active user with a verified linked Discord account is required."
      )
    if (
      !Number.isInteger(args.hours) ||
      args.hours < 1 ||
      args.hours > 24 ||
      args.roles.length > 10 ||
      new Set(args.roles).size !== args.roles.length ||
      !args.reason.trim() ||
      args.reason.length > 300
    )
      throw new Error(
        "Select distinct roles, a reason and a duration from 1 to 24 hours."
      )
    const previous = await ctx.db
      .query("communityRoleTestGrants")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first()
    if (previous && previous.revokedAt === undefined)
      await ctx.db.patch(previous._id, {
        revokedAt: Date.now(),
        revokedBy: actor._id,
        revocationReason: args.reason.trim(),
      })
    if (args.roles.length) {
      const roles = new Set(args.roles)
      if (roles.has("premiumCommunityOwner")) roles.add("communityOwner")
      if (roles.has("premiumCommunityManager")) roles.add("communityManager")
      const expiresAt = Date.now() + args.hours * 3600000
      const id = await ctx.db.insert("communityRoleTestGrants", {
        userId: args.userId,
        discordUserId: account.providerAccountId,
        linkedAccountId: account._id,
        roles: [...roles],
        reason: args.reason.trim(),
        grantedBy: actor._id,
        createdAt: Date.now(),
        expiresAt,
      })
      await ctx.scheduler.runAt(
        expiresAt,
        internal.communityRoleTesting.expire,
        { id }
      )
    }
    if (previous && previous.discordUserId !== account.providerAccountId)
      await queueRoleSync(ctx, previous.discordUserId)
    await queueRoleSync(ctx, account.providerAccountId)
    await ctx.scheduler.runAfter(
      0,
      internal.communityActions.publishLinkedRoles,
      { userId: args.userId }
    )
    return null
  },
})
export const expire = internalMutation({
  args: { id: v.id("communityRoleTestGrants") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await ctx.db.get(args.id)
    if (!grant || grant.revokedAt !== undefined || grant.expiresAt > Date.now())
      return null
    await ctx.db.patch(grant._id, { revokedAt: Date.now() })
    await queueRoleSync(ctx, grant.discordUserId)
    await ctx.scheduler.runAfter(
      0,
      internal.communityActions.publishLinkedRoles,
      { userId: grant.userId }
    )
    return null
  },
})

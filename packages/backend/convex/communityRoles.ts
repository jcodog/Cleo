import { v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { query, internalQuery, internalMutation } from "./_generated/server"
import { requireCurrentUser } from "./lib/auth"
import { roleEligibility, queueRoleSync } from "./lib/cleoRoleEligibility"
import { internal } from "./_generated/api"
import { userDoc, linkedAccountDoc } from "./lib/validators"
import { discordGuildEvidence } from "./dbTables/discordGuildMemberships"
import {
  currentDiscordAccount,
  discordGuildRefresh,
} from "./lib/discordGuildMemberships"
import { reconcileDiscordGuildRefresh } from "./lib/discordGuildRefresh"

const status = v.union(
  v.literal("eligible"),
  v.literal("notEligible"),
  v.literal("verificationNeeded"),
  v.literal("unavailable")
)
export const eligibilityValidator = v.object({
  member: status,
  personalPremium: status,
  creatorPro: status,
  discordBotUser: status,
  twitchBotUser: status,
  communityOwner: status,
  premiumCommunityOwner: status,
  communityManager: status,
  premiumCommunityManager: status,
  premiumSupporter: status,
})
export const eligibility = internalQuery({
  args: { discordUserId: v.string() },
  returns: eligibilityValidator,
  handler: (ctx, args) => roleEligibility(ctx, args.discordUserId),
})
export const current = query({
  args: {},
  returns: v.union(eligibilityValidator, v.null()),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "discord")
      )
      .take(2)
    return accounts.length === 1 && accounts[0]
      ? roleEligibility(ctx, accounts[0].providerAccountId)
      : null
  },
})
export const account = internalQuery({
  args: { userId: v.optional(v.id("users")) },
  returns: v.object({ user: userDoc, discord: linkedAccountDoc }),
  handler: async (ctx, args) => {
    const user = args.userId
      ? await ctx.db.get(args.userId)
      : await requireCurrentUser(ctx)
    if (!user || user.status === "disabled")
      throw new Error("Active account required.")
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "discord")
      )
      .take(2)
    if (accounts.length !== 1 || !accounts[0])
      throw new Error("Verified Discord identity required.")
    return { user, discord: accounts[0] }
  },
})
export const enqueue = internalMutation({
  args: { discordUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await queueRoleSync(ctx, args.discordUserId)
    return null
  },
})
const claimedFields = {
  id: v.id("communityRoleJobs"),
  discordUserId: v.string(),
  revision: v.number(),
  leaseUntil: v.number(),
}
export const roleJob = v.object({
  ...claimedFields,
  eligibility: eligibilityValidator,
})
export const claim = internalMutation({
  args: { worker: v.string() },
  returns: v.array(v.object(claimedFields)),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("communityRoleJobs")
      .withIndex("by_due", (q) => q.lte("nextAt", Date.now()))
      .take(5)
    const claimed = []
    for (const row of rows) {
      if (row.leaseUntil > Date.now()) continue
      await ctx.db.patch(row._id, {
        worker: args.worker,
        leaseUntil: Date.now() + 120000,
        attemptedRevision: row.revision,
        nextAt: Date.now() + 120000,
      })
      claimed.push({
        id: row._id,
        discordUserId: row.discordUserId,
        revision: row.revision,
        leaseUntil: Date.now() + 120000,
      })
    }
    return claimed
  },
})
export const dispatch = internalMutation({
  args: {
    worker: v.string(),
    jobs: v.array(
      v.object({ id: v.id("communityRoleJobs"), revision: v.number() })
    ),
  },
  returns: v.array(roleJob),
  handler: async (ctx, args) => {
    if (args.jobs.length > 5) throw new Error("Role batch exceeds limit.")
    const ready = []
    for (const job of args.jobs) {
      const row = await ctx.db.get(job.id)
      if (
        !row ||
        row.worker !== args.worker ||
        row.attemptedRevision !== job.revision
      )
        continue
      if (row.revision !== job.revision || row.leaseUntil <= Date.now()) {
        await ctx.db.patch(row._id, { leaseUntil: 0, nextAt: Date.now() })
        continue
      }
      const leaseUntil = Date.now() + 60000
      const eligibility = await roleEligibility(ctx, row.discordUserId)
      await ctx.db.patch(row._id, { leaseUntil, nextAt: leaseUntil })
      ready.push({
        ...job,
        discordUserId: row.discordUserId,
        leaseUntil,
        eligibility,
      })
    }
    return ready
  },
})
export const settle = internalMutation({
  args: {
    id: v.id("communityRoleJobs"),
    worker: v.string(),
    revision: v.number(),
    success: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id)
    if (
      !row ||
      row.worker !== args.worker ||
      row.attemptedRevision !== args.revision
    )
      return null
    await ctx.db.patch(row._id, {
      leaseUntil: 0,
      attempts: args.success ? 0 : row.attempts + 1,
      nextAt:
        row.revision !== args.revision
          ? Date.now()
          : Date.now() +
            (args.success
              ? 60000
              : Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 8))),
    })
    const account = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "discord").eq("providerAccountId", row.discordUserId)
      )
      .first()
    if (account)
      await ctx.scheduler.runAfter(
        0,
        internal.communityActions.publishLinkedRoles,
        { userId: account.userId }
      )
    return null
  },
})
export const bootstrap = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (backendEnv.CLEO_COMMUNITY_ROLES_ENABLED !== "true") return null
    const page = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "discord")
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 100 })
    for (const account of page.page)
      await queueRoleSync(ctx, account.providerAccountId, true)
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.communityRoles.bootstrap, {
        cursor: page.continueCursor,
      })
    return null
  },
})
export const forDiscord = internalQuery({
  args: { discordUserId: v.string() },
  returns: v.union(
    v.object({ user: userDoc, discord: linkedAccountDoc }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "discord").eq("providerAccountId", args.discordUserId)
      )
      .take(2)
    const discord = accounts.length === 1 ? accounts[0] : undefined
    const user = discord ? await ctx.db.get(discord.userId) : null
    return discord && user && user.status !== "disabled"
      ? { user, discord }
      : null
  },
})
export const refreshGuilds = internalMutation({
  args: {
    userId: v.id("users"),
    discordUserId: v.string(),
    reconciliation: v.optional(v.boolean()),
    observedAt: v.optional(v.number()),
    guilds: v.array(discordGuildEvidence),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      args.guilds.length > 1000 ||
      new Set(args.guilds.map((guild) => guild.id)).size !== args.guilds.length
    )
      throw new Error("Membership batch exceeds bounds or contains duplicates.")
    const account = await currentDiscordAccount(ctx, args.userId)
    if (!account || account.providerAccountId !== args.discordUserId)
      throw new Error("Discord identity changed.")
    const previous = await discordGuildRefresh(ctx, args.discordUserId)
    const observedAt = args.observedAt ?? Date.now()
    if (
      !Number.isSafeInteger(observedAt) ||
      observedAt > Date.now() + 5000 ||
      observedAt <= Date.now() - 300000 ||
      observedAt < account.createdAt
    )
      throw new Error("Discord membership verification expired or changed.")
    if (previous && previous.startedAt > observedAt) return null
    const revision = (previous?.revision ?? 0) + 1
    const value = {
      userId: args.userId,
      discordUserId: args.discordUserId,
      linkedAccountId: account._id,
      revision,
      startedAt: observedAt,
      state: "pending" as const,
      phase: "existing" as const,
      cursor: undefined,
      offset: 0,
      guilds: args.guilds,
      reconciliation: args.reconciliation ?? false,
    }
    const id =
      previous?._id ?? (await ctx.db.insert("discordGuildRefreshes", value))
    if (previous) await ctx.db.patch(id, value)
    await reconcileDiscordGuildRefresh(ctx, id, revision)
    return null
  },
})
export const continueGuildRefresh = internalMutation({
  args: { id: v.id("discordGuildRefreshes"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reconcileDiscordGuildRefresh(ctx, args.id, args.revision)
    return null
  },
})

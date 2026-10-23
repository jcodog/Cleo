import { v } from "convex/values"
import { query, internalQuery, internalMutation } from "./_generated/server"
import { requireCurrentUser } from "./lib/auth"
import { roleEligibility, queueRoleSync } from "./lib/cleoRoleEligibility"
import { internal } from "./_generated/api"
import { userDoc, linkedAccountDoc } from "./lib/validators"

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
export const roleJob = v.object({
  id: v.id("communityRoleJobs"),
  discordUserId: v.string(),
  revision: v.number(),
  leaseUntil: v.number(),
  eligibility: eligibilityValidator,
})
export const claim = internalMutation({
  args: { worker: v.string() },
  returns: v.array(roleJob),
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
        leaseUntil: Date.now() + 60000,
        attemptedRevision: row.revision,
        nextAt: Date.now() + 60000,
      })
      claimed.push({
        id: row._id,
        discordUserId: row.discordUserId,
        revision: row.revision,
        leaseUntil: Date.now() + 60000,
        eligibility: await roleEligibility(ctx, row.discordUserId),
      })
    }
    return claimed
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
    const page = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "discord")
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 100 })
    for (const account of page.page)
      await queueRoleSync(ctx, account.providerAccountId)
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
    guilds: v.array(
      v.object({
        id: v.string(),
        owner: v.optional(v.boolean()),
        permissions: v.optional(v.string()),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.guilds.length > 1000)
      throw new Error("Membership batch too large.")
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", "discord")
      )
      .take(2)
    if (
      accounts.length !== 1 ||
      accounts[0]?.providerAccountId !== args.discordUserId
    )
      throw new Error("Discord identity changed.")
    const now = Date.now()
    const old = await ctx.db
      .query("discordGuildMemberships")
      .withIndex("by_discord_user_id", (q) =>
        q.eq("discordUserId", args.discordUserId)
      )
      .take(101)
    const incoming = new Map(args.guilds.map((g) => [g.id, g]))
    for (const membership of old) {
      const guild = await ctx.db.get(membership.guildId)
      if (guild && !incoming.has(guild.discordGuildId))
        await ctx.db.patch(membership._id, {
          revokedAt: now,
          canManage: false,
          isOwner: false,
          permissions: "0",
          managementVerifiedAt: now,
          updatedAt: now,
        })
    }
    for (const incomingGuild of args.guilds) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discord_guild_id", (q) =>
          q.eq("discordGuildId", incomingGuild.id)
        )
        .unique()
      if (!guild || guild.botLeftAt !== undefined) continue
      const current = await ctx.db
        .query("discordGuildMemberships")
        .withIndex("by_guild_id_and_discord_user_id", (q) =>
          q.eq("guildId", guild._id).eq("discordUserId", args.discordUserId)
        )
        .unique()
      let canManage = !!incomingGuild.owner
      try {
        canManage ||= (BigInt(incomingGuild.permissions ?? "0") & 40n) !== 0n
      } catch {
        /* No authority from malformed permissions. */
      }
      const value = {
        guildId: guild._id,
        userId: args.userId,
        discordUserId: args.discordUserId,
        isOwner: !!incomingGuild.owner,
        permissions: incomingGuild.permissions ?? "0",
        canManage,
        managementVerifiedAt: now,
        managementVerificationSource: "discord-oauth" as const,
        revokedAt: undefined,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      }
      if (current) await ctx.db.patch(current._id, value)
      else await ctx.db.insert("discordGuildMemberships", value)
      if (incomingGuild.owner)
        await ctx.db.patch(guild._id, { ownerDiscordId: args.discordUserId })
      else if (guild.ownerDiscordId === args.discordUserId)
        await ctx.db.patch(guild._id, { ownerDiscordId: undefined })
    }
    if (!args.reconciliation) await queueRoleSync(ctx, args.discordUserId)
    return null
  },
})

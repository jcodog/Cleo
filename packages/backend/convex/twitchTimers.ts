import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import {
  timerConfiguration,
  TIMER_LEASE_MS,
} from "@workspace/shared/twitchTimers"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { requireCurrentUser } from "./lib/auth"
import { chatAccount, chatEvidence, runtimeReady } from "./twitchChat"
import { chatRevoked } from "./lib/twitchRevocation"
import {
  timerFields,
  timerState,
  timerProjection,
  timerGroupDoc,
  runtimePageResult,
  claimResult,
} from "./dbTables/twitchTimers"
import { userDoc, linkedAccountDoc } from "./lib/validators"

type Ctx = QueryCtx | MutationCtx
async function broadcaster(ctx: Ctx, userId: Id<"users">) {
  const accounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_provider", (q) =>
      q.eq("userId", userId).eq("provider", "twitch")
    )
    .take(2)
  const account = accounts[0]
  if (accounts.length !== 1 || !account)
    throw new ConvexError("Connect and sync your Twitch broadcaster first.")
  return account
}
async function groupsFor(ctx: Ctx, userId: Id<"users">) {
  return ctx.db
    .query("twitchTimerGroups")
    .withIndex("by_user", (q) => q.eq("userId", userId).eq("deleted", false))
    .take(3)
}
// Deliberately independent of Discord guild billing. Replace this resolver when
// genuine broadcaster subscriptions exist; test grants are never paid status.
export async function capacity(
  ctx: Ctx,
  userId: Id<"users">,
  broadcasterId: string
) {
  const grant = await ctx.db
    .query("twitchTimerGrants")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  return grant &&
    grant.broadcasterId === broadcasterId &&
    !grant.revokedAt &&
    grant.expiresAt > Date.now()
    ? { limit: 3, source: "testGrant" as const, expiresAt: grant.expiresAt }
    : { limit: 1, source: "free" as const, expiresAt: null }
}
async function owned(
  ctx: Ctx,
  id: Id<"twitchTimerGroups">,
  userId: Id<"users">
) {
  const group = await ctx.db.get(id)
  if (!group || group.deleted || group.userId !== userId)
    throw new ConvexError("Timer group unavailable.")
  return group
}
export const list = query({
  args: {},
  returns: v.object({
    entitlement: v.object({
      limit: v.number(),
      source: v.union(v.literal("free"), v.literal("testGrant")),
      expiresAt: v.union(v.number(), v.null()),
    }),
    connected: v.boolean(),
    groups: v.array(timerProjection),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "twitch")
      )
      .take(2)
    const account = accounts.length === 1 ? accounts[0] : undefined
    const entitlement = account
      ? await capacity(ctx, user._id, account.providerAccountId)
      : { limit: 1, source: "free" as const, expiresAt: null }
    const groups = await groupsFor(ctx, user._id)
    const eligible = groups
      .filter((g) => g.broadcasterId === account?.providerAccountId)
      .slice(0, entitlement.limit)
    return {
      entitlement,
      connected: !!account,
      groups: groups.map((g) => ({
        id: g._id,
        name: g.name,
        enabled: g.enabled,
        intervalMinutes: g.intervalMinutes,
        minimumMessages: g.minimumMessages,
        messages: g.messages,
        revision: g.revision,
        cursor: g.cursor,
        lastSentAt: g.lastSentAt,
        lastAttemptAt: g.lastAttemptAt,
        diagnostic: g.execution ? ("uncertain" as const) : g.diagnostic,
        diagnosticAt: g.diagnosticAt,
        locked: !eligible.some((e) => e._id === g._id),
        broadcasterChanged: g.broadcasterId !== account?.providerAccountId,
      })),
    }
  },
})
export const save = mutation({
  args: {
    id: v.optional(v.id("twitchTimerGroups")),
    revision: v.optional(v.number()),
    ...timerFields,
  },
  returns: v.id("twitchTimerGroups"),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const account = await broadcaster(ctx, user._id)
    const parsed = timerConfiguration.safeParse(args)
    if (!parsed.success)
      throw new ConvexError(
        "Invalid timer configuration. Check the name, ranges and messages."
      )
    const groups = await groupsFor(ctx, user._id)
    const entitlement = await capacity(ctx, user._id, account.providerAccountId)
    const eligible = groups
      .filter((g) => g.broadcasterId === account.providerAccountId)
      .slice(0, entitlement.limit)
    if (args.id) {
      const group = await owned(ctx, args.id, user._id)
      if (group.broadcasterId !== account.providerAccountId)
        throw new ConvexError(
          "This group belongs to a previously linked broadcaster. Delete it and create a new group."
        )
      if (group.revision !== args.revision)
        throw new ConvexError("This group changed. Reload before saving.")
      if (args.enabled && !eligible.some((g) => g._id === group._id))
        throw new ConvexError(
          "Premium access is required to enable this group."
        )
      await ctx.db.patch(group._id, {
        ...parsed.data,
        revision: group.revision + 1,
        updatedAt: Date.now(),
        cursor: 0,
      })
      return group._id
    }
    if (groups.length >= entitlement.limit)
      throw new ConvexError("Your timer group capacity has been reached.")
    return ctx.db.insert("twitchTimerGroups", {
      ...parsed.data,
      userId: user._id,
      broadcasterId: account.providerAccountId,
      order: Math.max(0, ...groups.map((g) => g.order + 1)),
      revision: 1,
      updatedAt: Date.now(),
      cursor: 0,
      deleted: false,
    })
  },
})
export const remove = mutation({
  args: { id: v.id("twitchTimerGroups") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireCurrentUser(ctx)
    const group = await owned(ctx, id, user._id)
    // Retain a small tombstone for incremental workers, never the deleted text.
    await ctx.db.patch(group._id, {
      deleted: true,
      enabled: false,
      messages: [],
      name: "Deleted group",
      revision: group.revision + 1,
      updatedAt: Date.now(),
    })
    return null
  },
})
export const provisionTestGrant = internalMutation({
  args: {
    userId: v.id("users"),
    broadcasterId: v.string(),
    expiresAt: v.number(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const account = await broadcaster(ctx, args.userId)
    const now = Date.now()
    if (
      account.providerAccountId !== args.broadcasterId ||
      !Number.isFinite(args.expiresAt) ||
      args.expiresAt <= now ||
      args.expiresAt > now + 30 * 86400_000 ||
      !args.reason.trim()
    )
      throw new ConvexError("Invalid test grant. Maximum duration is 30 days.")
    const grant = await ctx.db
      .query("twitchTimerGrants")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (grant) await ctx.db.replace(grant._id, args)
    else await ctx.db.insert("twitchTimerGrants", args)
    return null
  },
})
export const revokeTestGrant = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const grant = await ctx.db
      .query("twitchTimerGrants")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (grant) await ctx.db.patch(grant._id, { revokedAt: Date.now() })
    return null
  },
})
const pageArgs = {
  since: v.optional(v.number()),
  cursor: v.optional(v.string()),
}
export const runtimePage = internalQuery({
  args: pageArgs,
  returns: runtimePageResult,
  handler: async (ctx, args) => {
    const rows =
      args.since === undefined
        ? ctx.db
            .query("twitchTimerGroups")
            .withIndex("by_enabled", (q) =>
              q.eq("enabled", true).eq("deleted", false)
            )
        : ctx.db
            .query("twitchTimerGroups")
            .withIndex("by_updated", (q) => q.gte("updatedAt", args.since!))
    const page = await rows.paginate({
      numItems: 100,
      cursor: args.cursor ?? null,
    })
    return {
      groups: page.page.map((g) => ({
        id: g._id,
        broadcasterId: g.broadcasterId,
        name: g.name,
        enabled: g.enabled && !g.deleted,
        messages: g.messages,
        intervalMinutes: g.intervalMinutes,
        minimumMessages: g.minimumMessages,
        revision: g.revision,
        cursor: g.cursor,
        lastSentAt: g.lastSentAt,
        lastAttemptAt: g.lastAttemptAt,
      })),
      cursor: page.isDone ? null : page.continueCursor,
    }
  },
})
export const claimContext = internalQuery({
  args: { id: v.id("twitchTimerGroups") },
  returns: v.union(
    v.null(),
    v.object({
      group: timerGroupDoc,
      account: v.object({
        user: v.union(userDoc, v.null()),
        discord: v.array(linkedAccountDoc),
        twitch: v.array(linkedAccountDoc),
      }),
    })
  ),
  handler: async (ctx, { id }) => {
    const group = await ctx.db.get(id)
    return group && !group.deleted
      ? { group, account: await chatAccount(ctx, group.userId) }
      : null
  },
})
async function authorized(ctx: Ctx, group: Doc<"twitchTimerGroups">) {
  if (
    backendEnv.TWITCH_CHAT_PRESENCE_ENABLED !== "true" ||
    !(await runtimeReady(ctx))
  )
    return false
  const accounts = await chatAccount(ctx, group.userId)
  if (
    !accounts.user ||
    accounts.user.status === "disabled" ||
    accounts.twitch.length !== 1 ||
    accounts.twitch[0]?.providerAccountId !== group.broadcasterId
  )
    return false
  const membership = await ctx.db
    .query("twitchEventConsumers")
    .withIndex("by_consumer", (q) => q.eq("consumer", `chat:${group.userId}`))
    .first()
  const subscription = membership
    ? await ctx.db.get(membership.subscription)
    : null
  return (
    !!subscription &&
    subscription.broadcasterId === group.broadcasterId &&
    subscription.key === "chatMessage" &&
    subscription.status === "ready" &&
    !chatRevoked(subscription) &&
    subscription.condition.user_id === backendEnv.TWITCH_BOT_USER_ID
  )
}
export const claim = internalMutation({
  args: {
    id: v.id("twitchTimerGroups"),
    revision: v.number(),
    evidence: v.string(),
    verifiedAt: v.number(),
  },
  returns: claimResult,
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.id)
    const now = Date.now()
    if (
      !group ||
      group.deleted ||
      !group.enabled ||
      group.revision !== args.revision ||
      args.verifiedAt < now - 15_000 ||
      args.verifiedAt > now ||
      !timerConfiguration.safeParse(group).success
    )
      return null
    if (
      chatEvidence(await chatAccount(ctx, group.userId)) !== args.evidence ||
      !(await authorized(ctx, group))
    )
      return null
    const entitlement = await capacity(ctx, group.userId, group.broadcasterId)
    const eligible = (await groupsFor(ctx, group.userId))
      .filter((g) => g.broadcasterId === group.broadcasterId)
      .slice(0, entitlement.limit)
    if (
      !eligible.some((g) => g._id === group._id) ||
      (group.execution && group.execution.expiresAt > now) ||
      now <
        (group.lastAttemptAt ?? group._creationTime) +
          group.intervalMinutes * 60_000
    )
      return null
    const execution = {
      id: `${group._id}:${group.revision}:${now}`,
      revision: group.revision,
      cursor: group.cursor,
      expiresAt: now + TIMER_LEASE_MS,
    }
    await ctx.db.patch(group._id, {
      execution,
      lastAttemptAt: now,
      updatedAt: now,
      diagnostic: "uncertain",
      diagnosticAt: now,
    })
    return {
      executionId: execution.id,
      message: group.messages[group.cursor % group.messages.length]!,
      expiresAt: execution.expiresAt,
    }
  },
})
export const settle = internalMutation({
  args: {
    id: v.id("twitchTimerGroups"),
    executionId: v.string(),
    sent: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.id)
    if (!group?.execution || group.execution.id !== args.executionId)
      return null
    const now = Date.now()
    await ctx.db.patch(group._id, {
      execution: undefined,
      updatedAt: now,
      diagnostic: args.sent ? "ready" : "uncertain",
      diagnosticAt: now,
      ...(args.sent
        ? {
            lastSentAt: now,
            ...(group.revision === group.execution.revision && !group.deleted
              ? { cursor: (group.execution.cursor + 1) % group.messages.length }
              : {}),
          }
        : {}),
    })
    return null
  },
})
export const diagnose = internalMutation({
  args: {
    id: v.id("twitchTimerGroups"),
    revision: v.number(),
    state: timerState,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.id)
    if (
      group &&
      !group.deleted &&
      group.revision === args.revision &&
      !group.execution
    )
      await ctx.db.patch(group._id, {
        diagnostic: args.state,
        diagnosticAt: Date.now(),
      })
    return null
  },
})

import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { announcementKeys } from "@workspace/shared/twitchEventSub"
import {
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { requireCurrentUser } from "./lib/auth"
import { setEventConsumer } from "./lib/twitchConsumers"
import { userDoc, linkedAccountDoc } from "./lib/validators"
import { subscriptionStatus } from "./dbTables/twitchEventSub"
const accountFields = {
  user: v.union(userDoc, v.null()),
  discord: v.array(linkedAccountDoc),
  twitch: v.array(linkedAccountDoc),
}

async function chatState(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const membership = await ctx.db
    .query("twitchEventConsumers")
    .withIndex("by_consumer", (q) => q.eq("consumer", `chat:${userId}`))
    .first()
  const row = membership ? await ctx.db.get(membership.subscription) : null
  return row?.status ?? ("notConnected" as const)
}

export async function chatAccount(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
) {
  const user = await ctx.db.get(userId)
  const accounts = await ctx.db
    .query("linkedAccounts")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect()
  return {
    user,
    discord: accounts.filter((a) => a.provider === "discord"),
    twitch: accounts.filter((a) => a.provider === "twitch"),
  }
}
export function chatEvidence(
  account: Awaited<ReturnType<typeof chatAccount>>
): string {
  return JSON.stringify([account.user, account.discord, account.twitch])
}
export async function runtimeReady(
  ctx: QueryCtx | MutationCtx
): Promise<boolean> {
  const runtime = await ctx.db
    .query("twitchBotRuntime")
    .withIndex("by_key", (q) => q.eq("key", "chat-v1"))
    .unique()
  return (
    !!runtime &&
    runtime.clientId === backendEnv.TWITCH_CLIENT_ID &&
    runtime.botId === backendEnv.TWITCH_BOT_USER_ID &&
    runtime.updatedAt > Date.now() - 90000
  )
}
export const context = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    ...accountFields,
    evidence: v.string(),
    runtimeReady: v.boolean(),
    chatState: v.union(subscriptionStatus, v.literal("notConnected")),
  }),
  handler: async (ctx, { userId }) => {
    const account = await chatAccount(ctx, userId)
    return {
      ...account,
      evidence: chatEvidence(account),
      runtimeReady: await runtimeReady(ctx),
      chatState: await chatState(ctx, userId),
    }
  },
})
export const contextForConsumer = internalQuery({
  args: { consumer: v.string() },
  returns: v.union(
    v.null(),
    v.object({ ...accountFields, runtimeReady: v.boolean() })
  ),
  handler: async (ctx, { consumer }) => {
    if (!consumer.startsWith("chat:")) return null
    const userId = ctx.db.normalizeId("users", consumer.slice(5))
    if (!userId) return null
    return {
      ...(await chatAccount(ctx, userId)),
      runtimeReady: await runtimeReady(ctx),
    }
  },
})
export const reportReadiness = internalMutation({
  args: { clientId: v.string(), botId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      args.clientId !== backendEnv.TWITCH_CLIENT_ID ||
      args.botId !== backendEnv.TWITCH_BOT_USER_ID
    )
      throw new ConvexError("Twitch runtime identity mismatch.")
    const row = await ctx.db
      .query("twitchBotRuntime")
      .withIndex("by_key", (q) => q.eq("key", "chat-v1"))
      .unique()
    const value = { key: "chat-v1" as const, ...args, updatedAt: Date.now() }
    if (row) await ctx.db.patch(row._id, value)
    else await ctx.db.insert("twitchBotRuntime", value)
    return null
  },
})
export const save = internalMutation({
  args: {
    userId: v.id("users"),
    evidence: v.string(),
    broadcasterId: v.optional(v.string()),
    reauthorize: v.boolean(),
    authorization: v.string(),
  },
  returns: v.array(v.id("twitchEventSubscriptions")),
  handler: async (ctx, args) => {
    const account = await chatAccount(ctx, args.userId)
    if (chatEvidence(account) !== args.evidence) return []
    const previous = await ctx.db
      .query("twitchChatConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    const diagnostic = {
      userId: args.userId,
      authorization: args.authorization,
      checkedAt: Date.now(),
    }
    if (previous) await ctx.db.patch(previous._id, diagnostic)
    else await ctx.db.insert("twitchChatConnections", diagnostic)
    if (
      ["unavailable", "configurationUnavailable"].includes(args.authorization)
    )
      return []
    const enabled = !!args.broadcasterId && account.user?.status !== "disabled"
    if (
      enabled &&
      (backendEnv.TWITCH_CHAT_PRESENCE_ENABLED !== "true" ||
        !(await runtimeReady(ctx)))
    )
      return []
    const touched = await setEventConsumer(ctx, {
      consumer: `chat:${args.userId}`,
      key: "chatMessage",
      enabled,
      broadcasterId: args.broadcasterId,
      callback: backendEnv.TWITCH_EVENTSUB_CALLBACK_URL ?? "",
      botId: backendEnv.TWITCH_BOT_USER_ID ?? "",
    })
    const memberships = await ctx.db
      .query("twitchEventConsumers")
      .withIndex("by_consumer", (q) => q.eq("consumer", `chat:${args.userId}`))
      .collect()
    for (const membership of memberships) {
      const row = await ctx.db.get(membership.subscription)
      if (!row || (row.status === "revoked" && !args.reauthorize)) continue
      if (row.status === "revoked")
        await ctx.db.patch(row._id, {
          status: "connecting",
          failure: undefined,
          revision: row.revision + 1,
        })
      touched.push(row._id)
    }
    return [...new Set(touched)]
  },
})

// Runs within the trusted Clerk sync transaction. Only Twitch records are pruned.
export async function removeTwitchConsumers(
  ctx: MutationCtx,
  userId: Id<"users">
) {
  const diagnostic = await ctx.db
    .query("twitchChatConnections")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  if (diagnostic)
    await ctx.db.patch(diagnostic._id, {
      authorization: "needsLink",
      checkedAt: Date.now(),
    })
  const touched = new Set<Id<"twitchEventSubscriptions">>()
  const account = await chatAccount(ctx, userId)
  const consumers = new Set([
    `chat:${userId}`,
    ...announcementKeys.map((key) => `announcement:${userId}:${key}`),
  ])
  for (const twitch of account.twitch) {
    const rows = await ctx.db
      .query("twitchEventSubscriptions")
      .withIndex("by_broadcaster_key", (q) =>
        q
          .eq("broadcasterId", twitch.providerAccountId)
          .eq("key", "streamOnline")
      )
      .collect()
    for (const row of rows)
      for (const consumer of row.consumers) {
        if (!consumer.startsWith("guild:")) continue
        const guildId = ctx.db.normalizeId("guilds", consumer.slice(6))
        const guild = guildId ? await ctx.db.get(guildId) : null
        if (
          guild &&
          account.discord.some(
            (discord) => discord.providerAccountId === guild.ownerDiscordId
          )
        )
          consumers.add(consumer)
      }
  }
  for (const consumer of consumers) {
    // Existing membership supplies the provider identity; disabled consumers need no config.
    const memberships = await ctx.db
      .query("twitchEventConsumers")
      .withIndex("by_consumer", (q) => q.eq("consumer", consumer))
      .collect()
    for (const membership of memberships) {
      const row = await ctx.db.get(membership.subscription)
      if (row) {
        await ctx.db.patch(row._id, {
          consumers: row.consumers.filter((c) => c !== consumer),
          revision: row.revision + 1,
          updatedAt: Date.now(),
        })
        touched.add(row._id)
      }
      await ctx.db.delete(membership._id)
    }
  }
  for (const subscription of touched)
    await ctx.scheduler.runAfter(0, internal.twitchEventSubActions.reconcile, {
      subscription,
    })
}
export const eligiblePage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    userIds: v.array(v.id("users")),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_provider_and_provider_account_id", (q) =>
        q.eq("provider", "twitch")
      )
      .paginate({ numItems: 25, cursor: args.cursor ?? null })
    return {
      userIds: [...new Set(page.page.map((a) => a.userId))],
      cursor: page.isDone ? null : page.continueCursor,
    }
  },
})
export const status = query({
  args: {},
  returns: v.object({
    activated: v.boolean(),
    botReady: v.boolean(),
    botValidUntil: v.number(),
    chat: v.union(subscriptionStatus, v.literal("notConnected")),
    authorization: v.string(),
    checkedAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const diagnostic = await ctx.db
      .query("twitchChatConnections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique()
    const runtime = await ctx.db
      .query("twitchBotRuntime")
      .withIndex("by_key", (q) => q.eq("key", "chat-v1"))
      .unique()
    return {
      activated: backendEnv.TWITCH_CHAT_PRESENCE_ENABLED === "true",
      botReady: await runtimeReady(ctx),
      botValidUntil: runtime ? runtime.updatedAt + 90000 : 0,
      chat: await chatState(ctx, user._id),
      authorization: diagnostic?.authorization ?? "unverified",
      checkedAt: diagnostic?.checkedAt,
    }
  },
})

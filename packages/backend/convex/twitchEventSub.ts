import { v, ConvexError } from "convex/values"
import { query, internalQuery, internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireCurrentUser } from "./lib/auth"
import { setEventConsumer } from "./lib/twitchConsumers"
import {
  isAnnouncementKey,
  isEventKey,
  subscriptionIdentity,
  validateTemplate,
} from "@workspace/shared/twitchEventSub"
import { backendEnv } from "@workspace/env/backend"
import { twitchAnnouncementConfigs } from "./dbTables/twitchEventSub"
import { subscriptionStatus } from "./dbTables/twitchEventSub"
import { twitchEventSubscriptions } from "./dbTables/twitchEventSub"
import { userDoc, linkedAccountDoc } from "./lib/validators"
const subscriptionDoc = v.object({
  ...twitchEventSubscriptions.validator.fields,
  _id: v.id("twitchEventSubscriptions"),
  _creationTime: v.number(),
})

export const account = internalQuery({
  args: {},
  returns: v.object({
    user: userDoc,
    discord: v.array(linkedAccountDoc),
    twitch: v.array(linkedAccountDoc),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect()
    return {
      user,
      discord: accounts.filter((account) => account.provider === "discord"),
      twitch: accounts.filter((account) => account.provider === "twitch"),
    }
  },
})
export const settings = query({
  args: {},
  returns: v.object({
    configs: v.array(
      v.object({
        key: v.string(),
        enabled: v.boolean(),
        template: v.optional(v.string()),
      })
    ),
    subscriptions: v.array(
      v.object({
        key: v.string(),
        status: subscriptionStatus,
        failure: v.optional(v.string()),
      })
    ),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx)
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "twitch")
      )
      .collect()
    const configs = await ctx.db
      .query("twitchAnnouncementConfigs")
      .withIndex("by_user_key", (q) => q.eq("userId", user._id))
      .collect()
    const broadcasterIds = [
      ...new Set(configs.map((config) => config.broadcasterId)),
    ]
    const subscriptions = (
      await Promise.all(
        broadcasterIds
          .filter((id) =>
            accounts.some((account) => account.providerAccountId === id)
          )
          .map((broadcasterId) =>
            ctx.db
              .query("twitchEventSubscriptions")
              .withIndex("by_broadcaster", (q) =>
                q.eq("broadcasterId", broadcasterId)
              )
              .collect()
          )
      )
    ).flat()
    return {
      configs: configs.map(({ key, enabled, template }) => ({
        key,
        enabled,
        template,
      })),
      subscriptions: configs.flatMap((config) => {
        const consumer = `announcement:${user._id}:${config.key}`
        const candidates = subscriptions.filter(
          (row) =>
            row.key === config.key && row.broadcasterId === config.broadcasterId
        )
        // Callback changes retain historical rows. Project this consumer's active
        // subscription, or a failed cleanup when the feature has been disabled.
        const current = config.enabled
          ? candidates.find((row) => row.consumers.includes(consumer))
          : candidates
              .filter((row) => !row.consumers.length)
              .sort((a, b) => {
                const failed = (status: string) =>
                  status === "failed" || status === "providerUnavailable"
                return (
                  Number(failed(b.status)) - Number(failed(a.status)) ||
                  b.updatedAt - a.updatedAt
                )
              })[0]
        return current
          ? [
              {
                key: current.key,
                status: current.status,
                failure: current.failure,
              },
            ]
          : []
      }),
    }
  },
})
export const save = internalMutation({
  args: {
    broadcasterId: v.string(),
    key: v.string(),
    enabled: v.boolean(),
    template: v.optional(v.union(v.string(), v.null())),
    callback: v.string(),
    botId: v.string(),
  },
  returns: v.array(v.id("twitchEventSubscriptions")),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    if (!isAnnouncementKey(args.key))
      throw new ConvexError("Unknown announcement.")
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "twitch")
      )
      .collect()
    const previous = await ctx.db
      .query("twitchAnnouncementConfigs")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("key", args.key)
      )
      .unique()
    if (
      !accounts.some(
        (account) => account.providerAccountId === args.broadcasterId
      ) &&
      (args.enabled || previous?.broadcasterId !== args.broadcasterId)
    )
      throw new ConvexError("Twitch identity changed. Reconnect required.")
    const existingOwner = await ctx.db
      .query("twitchAnnouncementConfigs")
      .withIndex("by_broadcaster_key", (q) =>
        q.eq("broadcasterId", args.broadcasterId).eq("key", args.key)
      )
      .unique()
    if (existingOwner && existingOwner.userId !== user._id)
      throw new ConvexError(
        "This broadcaster is configured by another Cleo account."
      )
    const template =
      args.template === undefined
        ? previous?.template
        : args.template === null
          ? undefined
          : validateTemplate(args.key, args.template)
    const config = {
      userId: user._id,
      broadcasterId: args.broadcasterId,
      key: args.key,
      enabled: args.enabled,
      template,
      updatedAt: Date.now(),
    }
    if (previous) await ctx.db.patch(previous._id, config)
    else await ctx.db.insert("twitchAnnouncementConfigs", config)
    if (
      previous?.enabled === args.enabled &&
      previous.broadcasterId === args.broadcasterId
    )
      return []
    return setEventConsumer(ctx, {
      consumer: `announcement:${user._id}:${args.key}`,
      key: args.key,
      broadcasterId: args.broadcasterId,
      enabled: args.enabled,
      callback: args.callback,
      botId: args.botId,
    })
  },
})
export const announcement = internalQuery({
  args: { key: v.string() },
  returns: v.union(
    v.object({
      ...twitchAnnouncementConfigs.validator.fields,
      _id: v.id("twitchAnnouncementConfigs"),
      _creationTime: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    return ctx.db
      .query("twitchAnnouncementConfigs")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("key", args.key)
      )
      .unique()
  },
})
export const subscription = internalQuery({
  args: { subscription: v.id("twitchEventSubscriptions") },
  returns: v.union(subscriptionDoc, v.null()),
  handler: (ctx, args) => ctx.db.get(args.subscription),
})
export const acquire = internalMutation({
  args: { subscription: v.id("twitchEventSubscriptions"), lease: v.string() },
  returns: v.union(subscriptionDoc, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscription)
    if (!row || (row.lease && (row.leaseExpiresAt ?? 0) > Date.now()))
      return null
    await ctx.db.patch(row._id, {
      lease: args.lease,
      leaseExpiresAt: Date.now() + 60000,
      status: row.consumers.length ? "connecting" : row.status,
    })
    // Recovery is scoped to this operation, never a desired-subscription polling loop.
    await ctx.scheduler.runAfter(
      61000,
      internal.twitchEventSubActions.recover,
      args
    )
    return row
  },
})
export const settle = internalMutation({
  args: {
    subscription: v.id("twitchEventSubscriptions"),
    lease: v.string(),
    revision: v.number(),
    subscriptionId: v.optional(v.string()),
    status: subscriptionStatus,
    failure: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscription)
    if (!row || row.lease !== args.lease) return null
    const status =
      args.status === "connecting" &&
      row.status === "ready" &&
      row.subscriptionId === args.subscriptionId
        ? "ready"
        : args.status
    await ctx.db.patch(row._id, {
      lease: undefined,
      leaseExpiresAt: undefined,
      subscriptionId: args.subscriptionId,
      status,
      failure: args.failure,
      updatedAt: Date.now(),
    })
    if (row.revision !== args.revision)
      await ctx.scheduler.runAfter(
        0,
        internal.twitchEventSubActions.reconcile,
        { subscription: row._id }
      )
    return null
  },
})
export const retryTarget = internalQuery({
  args: { key: v.string() },
  returns: v.array(v.id("twitchEventSubscriptions")),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const memberships = await ctx.db
      .query("twitchEventConsumers")
      .withIndex("by_consumer", (q) =>
        q.eq("consumer", `announcement:${user._id}:${args.key}`)
      )
      .collect()
    if (memberships.length) return memberships.map((row) => row.subscription)
    const config = await ctx.db
      .query("twitchAnnouncementConfigs")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("key", args.key)
      )
      .unique()
    if (!config) return []
    return (
      await ctx.db
        .query("twitchEventSubscriptions")
        .withIndex("by_broadcaster", (q) =>
          q.eq("broadcasterId", config.broadcasterId)
        )
        .collect()
    )
      .filter((row) => row.key === args.key && !row.consumers.length)
      .map((row) => row._id)
  },
})
export const webhookState = internalMutation({
  args: {
    subscriptionId: v.string(),
    revoked: v.boolean(),
    key: v.optional(v.string()),
    broadcasterId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let row = await ctx.db
      .query("twitchEventSubscriptions")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .unique()
    if (
      !row &&
      args.key &&
      isEventKey(args.key) &&
      args.broadcasterId &&
      backendEnv.TWITCH_BOT_USER_ID &&
      backendEnv.TWITCH_EVENTSUB_CALLBACK_URL
    ) {
      const identity = subscriptionIdentity(
        args.key,
        args.broadcasterId,
        backendEnv.TWITCH_BOT_USER_ID,
        backendEnv.TWITCH_EVENTSUB_CALLBACK_URL
      )
      row = await ctx.db
        .query("twitchEventSubscriptions")
        .withIndex("by_identity", (q) => q.eq("identity", identity))
        .unique()
    }
    if (row?.consumers.length)
      await ctx.db.patch(row._id, {
        subscriptionId: args.subscriptionId,
        status: args.revoked ? "revoked" : "ready",
        updatedAt: Date.now(),
      })
    return null
  },
})
export const reserveEvent = internalMutation({
  args: { messageId: v.string(), key: v.string(), broadcasterId: v.string() },
  returns: v.object({
    duplicate: v.boolean(),
    template: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("twitchWebhookReceipts")
        .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
        .unique()
    )
      return { duplicate: true }
    await ctx.db.insert("twitchWebhookReceipts", {
      messageId: args.messageId,
      createdAt: Date.now(),
    })
    const config = isAnnouncementKey(args.key)
      ? await ctx.db
          .query("twitchAnnouncementConfigs")
          .withIndex("by_broadcaster_key", (q) =>
            q.eq("broadcasterId", args.broadcasterId).eq("key", args.key)
          )
          .unique()
      : null
    return {
      duplicate: false,
      ...(config?.template ? { template: config.template } : {}),
    }
  },
})
export const cleanupReceipts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("twitchWebhookReceipts")
      .withIndex("by_created", (q) => q.lt("createdAt", Date.now() - 86400000))
      .take(100)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length === 100)
      await ctx.scheduler.runAfter(
        0,
        internal.twitchEventSub.cleanupReceipts,
        {}
      )
    return null
  },
})

export const guildTargets = internalQuery({
  args: { broadcasterId: v.optional(v.string()) },
  returns: v.array(v.id("twitchEventSubscriptions")),
  handler: async (ctx, args) => {
    const rows = args.broadcasterId
      ? await ctx.db
          .query("twitchEventSubscriptions")
          .withIndex("by_broadcaster", (q) =>
            q.eq("broadcasterId", args.broadcasterId!)
          )
          .collect()
      : []
    return rows
      .filter((row) => row.key === "streamOnline")
      .map((row) => row._id)
  },
})

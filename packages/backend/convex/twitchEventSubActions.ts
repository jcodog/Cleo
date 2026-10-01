"use node"

import { randomUUID, timingSafeEqual, createHash } from "node:crypto"
import { v, ConvexError } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import {
  isEventKey,
  isAnnouncementKey,
  resolveBroadcasterScopes,
  validateTemplate,
} from "@workspace/shared/twitchEventSub"
import { action, internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import {
  TwitchEventSubApi,
  EventSubProviderError,
} from "./lib/twitchEventSubApi"
import { verifyOwnerTwitch } from "./lib/verifyOwnerTwitch"

export function controlPlaneConfig() {
  const {
    TWITCH_CLIENT_ID: clientId,
    TWITCH_CLIENT_SECRET: clientSecret,
    TWITCH_EVENTSUB_CALLBACK_URL: callback,
    TWITCH_EVENTSUB_SECRET: secret,
    TWITCH_BOT_USER_ID: botId,
  } = backendEnv
  if (!clientId || !clientSecret || !callback || !secret || !botId)
    throw new ConvexError("Twitch provider unavailable.")
  return { clientId, clientSecret, callback, secret, botId }
}
export const reconcile = internalAction({
  args: { subscription: v.id("twitchEventSubscriptions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lease = randomUUID()
    const row = await ctx.runMutation(internal.twitchEventSub.acquire, {
      ...args,
      lease,
    })
    if (!row) return null
    let subscriptionId = row.subscriptionId
    let status:
      "disabled" | "ready" | "connecting" | "failed" | "providerUnavailable" =
      "disabled"
    try {
      if (!isEventKey(row.key)) throw new Error("Unknown event.")
      const api = new TwitchEventSubApi({
        ...controlPlaneConfig(),
        callback: row.callback,
      })
      const token = await api.acquireToken()
      if (!row.consumers.length) {
        const existing = subscriptionId
          ? { id: subscriptionId }
          : await api.find(token, row.key, row.condition)
        if (existing) await api.delete(token, existing.id)
        subscriptionId = undefined
      } else {
        const subscription =
          (await api.find(token, row.key, row.condition)) ??
          (await api.create(token, row.key, row.condition))
        subscriptionId = subscription.id
        status = subscription.status === "enabled" ? "ready" : "connecting"
      }
    } catch (error) {
      status =
        error instanceof EventSubProviderError
          ? error.kind
          : "providerUnavailable"
    }
    await ctx.runMutation(internal.twitchEventSub.settle, {
      ...args,
      lease,
      revision: row.revision,
      subscriptionId,
      status,
      ...(status === "failed" || status === "providerUnavailable"
        ? { failure: status }
        : {}),
    })
    return null
  },
})
export const recover = internalAction({
  args: { subscription: v.id("twitchEventSubscriptions"), lease: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.twitchEventSub.subscription, {
      subscription: args.subscription,
    })
    if (row?.lease === args.lease)
      await ctx.runAction(internal.twitchEventSubActions.reconcile, {
        subscription: args.subscription,
      })
    return null
  },
})
export const updateAnnouncement = action({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    template: v.optional(v.union(v.string(), v.null())),
    retry: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isAnnouncementKey(args.key))
      throw new ConvexError("Unknown announcement.")
    if (args.template != null) validateTemplate(args.key, args.template)
    const context = await ctx.runQuery(internal.twitchEventSub.account, {})
    const previous = await ctx.runQuery(internal.twitchEventSub.announcement, {
      key: args.key,
    })
    if (!args.enabled) {
      const broadcasterId =
        previous?.broadcasterId ?? context.twitch[0]?.providerAccountId
      if (!broadcasterId) throw new ConvexError("Reconnect required.")
      const touched = await ctx.runMutation(internal.twitchEventSub.save, {
        key: args.key,
        enabled: false,
        template: args.template,
        broadcasterId,
        callback: backendEnv.TWITCH_EVENTSUB_CALLBACK_URL ?? "",
        botId: backendEnv.TWITCH_BOT_USER_ID ?? "",
      })
      const targets = args.retry
        ? await ctx.runQuery(internal.twitchEventSub.retryTarget, {
            key: args.key,
          })
        : touched
      for (const subscription of targets)
        await ctx.runAction(internal.twitchEventSubActions.reconcile, {
          subscription,
        })
      return null
    }
    const config = controlPlaneConfig()
    const discord = context.discord[0]
    const twitch = context.twitch[0]
    if (context.discord.length !== 1 || !discord || !twitch)
      throw new ConvexError("Reconnect required.")
    // Reuse the trusted Clerk + Twitch verifier without accepting browser-supplied identity.
    const source = await verifyOwnerTwitch(
      {
        status: "linked",
        user: context.user,
        discord,
        twitch,
        twitchAccounts: context.twitch,
      },
      args.enabled ? resolveBroadcasterScopes([args.key]) : ["channel:bot"],
      config.clientId
    )
    if (source.status !== "ready")
      throw new ConvexError(
        source.status === "unavailable"
          ? "Provider unavailable."
          : "Reconnect required. Missing permission."
      )
    const touched = await ctx.runMutation(internal.twitchEventSub.save, {
      key: args.key,
      enabled: args.enabled,
      template: args.template,
      broadcasterId: source.broadcasterId,
      callback: config.callback,
      botId: config.botId,
    })
    const targets = args.retry
      ? await ctx.runQuery(internal.twitchEventSub.retryTarget, {
          key: args.key,
        })
      : touched
    for (const subscription of targets)
      await ctx.runAction(internal.twitchEventSubActions.reconcile, {
        subscription,
      })
    return null
  },
})
export function assertWorkerSecret(secret: string) {
  const expected = backendEnv.TWITCH_WORKER_SECRET
  if (
    !expected ||
    !secret ||
    !timingSafeEqual(
      createHash("sha256").update(secret).digest(),
      createHash("sha256").update(expected).digest()
    )
  )
    throw new ConvexError("Unauthorized Twitch worker.")
}
export const reserveEvent = action({
  args: {
    secret: v.string(),
    messageId: v.string(),
    key: v.string(),
    broadcasterId: v.string(),
  },
  returns: v.object({
    duplicate: v.boolean(),
    template: v.optional(v.string()),
  }),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    if (
      !isEventKey(args.key) ||
      !args.messageId ||
      args.messageId.length > 512 ||
      !/^[1-9]\d*$/.test(args.broadcasterId)
    )
      throw new ConvexError("Invalid event.")
    return ctx.runMutation(internal.twitchEventSub.reserveEvent, args)
  },
})
export const webhookState = action({
  args: {
    secret: v.string(),
    subscriptionId: v.string(),
    revoked: v.boolean(),
    key: v.optional(v.string()),
    broadcasterId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    return ctx.runMutation(internal.twitchEventSub.webhookState, args)
  },
})

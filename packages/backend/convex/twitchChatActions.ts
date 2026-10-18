"use node"

import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { action, internalAction, type ActionCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { verifyOwnerTwitch } from "./lib/verifyOwnerTwitch"
import { assertWorkerSecret, controlPlaneConfig } from "./twitchEventSubActions"
import { boundedMap } from "./lib/boundedMap"

export const reportReadiness = action({
  args: { secret: v.string(), clientId: v.string(), botId: v.string() },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    return ctx.runMutation(internal.twitchChat.reportReadiness, args)
  },
})

async function synchronize(
  ctx: ActionCtx,
  userId: Id<"users">,
  reauthorize = false
): Promise<string> {
  const context = await ctx.runQuery(internal.twitchChat.context, { userId })
  const config = controlPlaneConfig()
  const { user, discord, twitch } = context
  const source =
    user &&
    user.status !== "disabled" &&
    discord.length === 1 &&
    discord[0] &&
    twitch[0]
      ? await verifyOwnerTwitch(
          {
            status: "linked",
            user,
            discord: discord[0],
            twitch: twitch[0],
            twitchAccounts: twitch,
          },
          ["channel:bot"],
          config.clientId
        )
      : { status: "needsLink" as const }
  const authorized =
    source.status === "ready" && source.broadcasterId !== config.botId
  const subscriptions = await ctx.runMutation(internal.twitchChat.save, {
    userId,
    evidence: context.evidence,
    broadcasterId: authorized ? source.broadcasterId : undefined,
    reauthorize,
    authorization:
      source.status === "ready" && !authorized
        ? "identityConflict"
        : source.status,
  })
  await boundedMap(subscriptions, 4, (subscription) =>
    ctx.runAction(internal.twitchEventSubActions.reconcile, {
      subscription,
      reauthorize,
    })
  )
  if (!authorized)
    return source.status === "ready" ? "identityConflict" : source.status
  if (context.chatState === "revoked" && !reauthorize) return "revoked"
  return backendEnv.TWITCH_CHAT_PRESENCE_ENABLED !== "true"
    ? "activationRequired"
    : !context.runtimeReady
      ? "runtimeUnavailable"
      : (await ctx.runQuery(internal.twitchChat.context, { userId })).chatState
}
export const syncUser = internalAction({
  args: {
    userId: v.id("users"),
    attempt: v.optional(v.number()),
    reauthorize: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let status: string
    try {
      status = await synchronize(ctx, args.userId, args.reauthorize)
    } catch {
      status = "unavailable"
    }
    const attempt = args.attempt ?? 0
    if (
      [
        "unavailable",
        "configurationUnavailable",
        "runtimeUnavailable",
      ].includes(status) &&
      attempt < 3
    )
      await ctx.scheduler.runAfter(
        30000 * 2 ** attempt,
        internal.twitchChatActions.syncUser,
        {
          userId: args.userId,
          attempt: attempt + 1,
          reauthorize: args.reauthorize,
        }
      )
    return null
  },
})
export const retry = action({
  args: { reauthorize: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.twitchEventSub.account, {})
    return synchronize(ctx, context.user._id, args.reauthorize ?? false)
  },
})
// One bounded page per operator invocation. Never a recurring subscription scan.
export const migrate = internalAction({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    processed: v.number(),
    deferred: v.number(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    if (backendEnv.TWITCH_CHAT_PRESENCE_ENABLED !== "true")
      throw new ConvexError("Chat presence activation required.")
    const page = await ctx.runQuery(internal.twitchChat.eligiblePage, args)
    let deferred = 0
    await boundedMap(page.userIds, 4, async (userId) => {
      try {
        if ((await synchronize(ctx, userId)) !== "ready") deferred++
      } catch {
        deferred++
      }
    })
    return { processed: page.userIds.length, deferred, cursor: page.cursor }
  },
})

export const retire = internalAction({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    processed: v.number(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    if (backendEnv.TWITCH_CHAT_PRESENCE_ENABLED === "true")
      throw new ConvexError(
        "Disable chat presence activation before retiring subscriptions."
      )
    const page = await ctx.runQuery(internal.twitchChat.eligiblePage, args)
    await boundedMap(page.userIds, 4, async (userId) => {
      const context = await ctx.runQuery(internal.twitchChat.context, {
        userId,
      })
      const subscriptions = await ctx.runMutation(internal.twitchChat.save, {
        userId,
        evidence: context.evidence,
        reauthorize: false,
        authorization: "paused",
      })
      await boundedMap(subscriptions, 4, (subscription) =>
        ctx.runAction(internal.twitchEventSubActions.reconcile, {
          subscription,
        })
      )
    })
    return { processed: page.userIds.length, cursor: page.cursor }
  },
})

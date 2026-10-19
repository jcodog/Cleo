"use node"

import { v, ConvexError } from "convex/values"
import { action } from "./_generated/server"
import { internal } from "./_generated/api"
import { assertWorkerSecret, controlPlaneConfig } from "./twitchEventSubActions"
import { verifyOwnerTwitch } from "./lib/verifyOwnerTwitch"
import { chatEvidence } from "./twitchChat"
import { timerState, runtimeGroup, claimResult } from "./dbTables/twitchTimers"

export const page = action({
  args: {
    secret: v.string(),
    since: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    groups: v.array(runtimeGroup),
    cursor: v.union(v.string(), v.null()),
    startedAt: v.number(),
  }),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    return ctx.runQuery(internal.twitchTimers.runtimePage, args)
  },
})
export const claim = action({
  args: {
    secret: v.string(),
    id: v.id("twitchTimerGroups"),
    revision: v.number(),
    streamId: v.string(),
  },
  returns: claimResult,
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    const current = await ctx.runQuery(internal.twitchTimers.claimContext, {
      id: args.id,
    })
    if (!current) return null
    const { account, group } = current
    const discord = account.discord[0]
    const twitch = account.twitch[0]
    if (
      !account.user ||
      account.user.status === "disabled" ||
      account.discord.length !== 1 ||
      !discord ||
      account.twitch.length !== 1 ||
      !twitch
    )
      return null
    const config = controlPlaneConfig()
    const verified = await verifyOwnerTwitch(
      {
        status: "linked",
        user: account.user,
        discord,
        twitch,
        twitchAccounts: account.twitch,
      },
      ["channel:bot"],
      config.clientId
    )
    if (
      verified.status === "unavailable" ||
      verified.status === "configurationUnavailable"
    )
      throw new ConvexError("Twitch provider unavailable.")
    if (
      verified.status !== "ready" ||
      verified.broadcasterId !== group.broadcasterId ||
      verified.broadcasterId === config.botId
    )
      return null
    return ctx.runMutation(internal.twitchTimers.claim, {
      ...args,
      evidence: chatEvidence(account),
      verifiedAt: Date.now(),
    })
  },
})
export const settle = action({
  args: {
    secret: v.string(),
    id: v.id("twitchTimerGroups"),
    executionId: v.string(),
    sent: v.boolean(),
    definite: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    return ctx.runMutation(internal.twitchTimers.settle, args)
  },
})
export const begin = action({
  args: {
    secret: v.string(),
    id: v.id("twitchTimerGroups"),
    executionId: v.string(),
    streamId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    return ctx.runMutation(internal.twitchTimers.begin, args)
  },
})
export const session = action({
  args: {
    secret: v.string(),
    broadcasterId: v.string(),
    streamId: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    observedAt: v.number(),
    eventAt: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    return ctx.runMutation(internal.twitchTimers.session, args)
  },
})
export const diagnose = action({
  args: {
    secret: v.string(),
    id: v.id("twitchTimerGroups"),
    revision: v.number(),
    state: timerState,
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    return ctx.runMutation(internal.twitchTimers.diagnose, args)
  },
})

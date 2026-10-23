"use node"
import { action } from "./_generated/server"
import { internal } from "./_generated/api"
import { v } from "convex/values"
import { moderationPlatform } from "./dbTables/communityIntegrations"
import { assertValidBotSecret } from "./actions/bot/discord/lib/auth"
import { assertWorkerSecret } from "./twitchEventSubActions"
import { verifyOwnerTwitch } from "./lib/verifyOwnerTwitch"
import {
  moderationActionSchema,
  compileModerationPolicy,
  MODERATION_ROLLOUT_LOCKED,
} from "@workspace/shared/moderation"
import { backendEnv } from "@workspace/env/backend"
import { moderationRuntimeValue } from "./lib/communityValidators"

export const runtime = action({
  args: {
    secret: v.string(),
    platform: moderationPlatform,
    scopeId: v.string(),
    worker: v.string(),
    health: v.optional(v.string()),
  },
  returns: moderationRuntimeValue,
  handler: async (ctx, { secret, ...args }) => {
    if (args.platform === "discord") assertValidBotSecret(secret)
    else assertWorkerSecret(secret)
    if (MODERATION_ROLLOUT_LOCKED) return null
    if (
      !args.scopeId ||
      args.scopeId.length > 128 ||
      !args.worker ||
      args.worker.length > 128
    )
      throw new Error("Invalid moderation runtime identity.")
    return ctx.runMutation(internal.moderationPolicies.runtime, args)
  },
})
export const claimDiscord = action({
  args: {
    secret: v.string(),
    scopeId: v.string(),
    worker: v.string(),
    revision: v.number(),
    messageId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { secret, ...args }) => {
    assertValidBotSecret(secret)
    if (MODERATION_ROLLOUT_LOCKED) return false
    return ctx.runMutation(internal.moderationPolicies.claimEnforcement, {
      ...args,
      platform: "discord",
    })
  },
})
export const enforceTwitch = action({
  args: {
    secret: v.string(),
    scopeId: v.string(),
    worker: v.string(),
    revision: v.number(),
    authorId: v.string(),
    messageId: v.string(),
    actionJSON: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertWorkerSecret(secret)
    if (MODERATION_ROLLOUT_LOCKED)
      throw new Error("Moderation is not available in this release.")
    if (
      backendEnv.TWITCH_MODERATION_ENFORCEMENT_ENABLED !== "true" ||
      args.actionJSON.length > 1024 ||
      !/^[1-9]\d*$/.test(args.authorId) ||
      !args.messageId ||
      args.messageId.length > 128 ||
      args.authorId === args.scopeId
    )
      throw new Error("Moderation action unavailable.")
    const context = await ctx.runMutation(
      internal.moderationPolicies.enforcementContext,
      { scopeId: args.scopeId, worker: args.worker, revision: args.revision }
    )
    if (
      !context?.user ||
      context.discord.length !== 1 ||
      context.twitch.length !== 1 ||
      !context.discord[0] ||
      !context.twitch[0]
    )
      throw new Error("Moderation authority unavailable.")
    const proposed = moderationActionSchema.parse(JSON.parse(args.actionJSON))
    const policy = compileModerationPolicy(JSON.parse(context.policyJSON))
    if (
      !Object.values(policy.policy.rules).some(
        (r) =>
          r.enabled && JSON.stringify(r.action) === JSON.stringify(proposed)
      )
    )
      throw new Error("Action not configured.")
    if (proposed.kind === "log") return null
    const scope =
      proposed.kind === "delete"
        ? "moderator:manage:chat_messages"
        : proposed.kind === "warn"
          ? "moderator:manage:warnings"
          : "moderator:manage:banned_users"
    const owner = await verifyOwnerTwitch(
      {
        status: "linked",
        user: context.user,
        discord: context.discord[0],
        twitch: context.twitch[0],
        twitchAccounts: context.twitch,
      },
      [scope],
      backendEnv.TWITCH_CLIENT_ID
    )
    if (owner.status !== "ready" || owner.broadcasterId !== args.scopeId)
      throw new Error("Broadcaster moderation scope required.")
    const query = new URLSearchParams({
      broadcaster_id: args.scopeId,
      moderator_id: args.scopeId,
    })
    if (proposed.kind === "delete") query.set("message_id", args.messageId)
    const endpoint =
      proposed.kind === "delete"
        ? "chat"
        : proposed.kind === "warn"
          ? "warnings"
          : "bans"
    if (
      !(await ctx.runMutation(internal.moderationPolicies.claimEnforcement, {
        platform: "twitch",
        scopeId: args.scopeId,
        worker: args.worker,
        revision: args.revision,
        messageId: args.messageId,
      }))
    )
      return null
    const response = await fetch(
      `https://api.twitch.tv/helix/moderation/${endpoint}?${query}`,
      {
        method: proposed.kind === "delete" ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${owner.accessToken}`,
          "Client-Id": owner.clientId,
          "Content-Type": "application/json",
        },
        ...(proposed.kind === "delete"
          ? {}
          : {
              body: JSON.stringify({
                data: {
                  user_id: args.authorId,
                  reason: "Please follow this community's chat rules.",
                  ...(proposed.kind === "timeout"
                    ? { duration: Math.min(proposed.durationSeconds, 1209600) }
                    : {}),
                },
              }),
            }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }
    )
    if (!response.ok)
      throw new Error("Twitch moderation permission unavailable.")
    return null
  },
})

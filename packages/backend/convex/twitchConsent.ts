import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { subscriptionIdentity } from "@workspace/shared/twitchEventSub"
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { chatAccount, chatEvidence } from "./twitchChat"
import { chatRevoked } from "./lib/twitchRevocation"
import { twitchChatConsents } from "./dbTables/twitchEventSub"

const proofDoc = v.object({
  ...twitchChatConsents.validator.fields,
  _id: v.id("twitchChatConsents"),
  _creationTime: v.number(),
})
const invalid = () =>
  new ConvexError(
    "Twitch consent expired or changed. Start authorization again."
  )

async function binding(
  ctx: QueryCtx | MutationCtx,
  proof: Doc<"twitchChatConsents">
) {
  const user = await ctx.db.get(proof.userId)
  const linked = await ctx.db.get(proof.linkedAccount)
  const row = await ctx.db.get(proof.subscription)
  return (
    !!user &&
    user.status !== "disabled" &&
    user.clerkUserId === proof.clerkUserId &&
    linked?.userId === user._id &&
    linked.provider === "twitch" &&
    linked.providerAccountId === proof.broadcasterId &&
    proof.clientId === backendEnv.TWITCH_CLIENT_ID &&
    proof.expiresAt > Date.now() &&
    !!row &&
    row.broadcasterId === proof.broadcasterId &&
    (row.revocationVersion ?? 0) === proof.revocationVersion &&
    row.identity ===
      subscriptionIdentity(
        "chatMessage",
        proof.broadcasterId,
        backendEnv.TWITCH_BOT_USER_ID ?? "",
        backendEnv.TWITCH_EVENTSUB_CALLBACK_URL ?? ""
      )
  )
}

export const begin = internalMutation({
  args: {
    userId: v.id("users"),
    evidence: v.string(),
    stateHash: v.string(),
    nonceHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const account = await chatAccount(ctx, args.userId)
    const linked = account.twitch[0]
    if (
      chatEvidence(account) !== args.evidence ||
      !account.user ||
      account.user.status === "disabled" ||
      account.twitch.length !== 1 ||
      !linked ||
      !backendEnv.TWITCH_CLIENT_ID ||
      backendEnv.TWITCH_CHAT_PRESENCE_ENABLED !== "true"
    )
      throw invalid()
    const identity = subscriptionIdentity(
      "chatMessage",
      linked.providerAccountId,
      backendEnv.TWITCH_BOT_USER_ID ?? "",
      backendEnv.TWITCH_EVENTSUB_CALLBACK_URL ?? ""
    )
    const row = await ctx.db
      .query("twitchEventSubscriptions")
      .withIndex("by_identity", (q) => q.eq("identity", identity))
      .unique()
    if (!row || !chatRevoked(row)) throw invalid()
    const previous = await ctx.db
      .query("twitchChatConsents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (previous && previous.issuedAt > Date.now() - 30000)
      throw new ConvexError(
        "Authorization is already starting. Try again shortly."
      )
    if (previous) await ctx.db.delete(previous._id)
    const consent = await ctx.db.insert("twitchChatConsents", {
      userId: args.userId,
      clerkUserId: account.user.clerkUserId,
      linkedAccount: linked._id,
      broadcasterId: linked.providerAccountId,
      clientId: backendEnv.TWITCH_CLIENT_ID,
      subscription: row._id,
      revocationVersion: row.revocationVersion ?? 0,
      stateHash: args.stateHash,
      nonceHash: args.nonceHash,
      state: "pending",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 600000,
    })
    await ctx.scheduler.runAfter(600001, internal.twitchConsent.expire, {
      consent,
    })
    return null
  },
})
export const claim = internalMutation({
  args: { userId: v.id("users"), stateHash: v.string() },
  returns: proofDoc,
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("twitchChatConsents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique()
    if (
      !proof ||
      proof.state !== "pending" ||
      proof.stateHash !== args.stateHash ||
      !(await binding(ctx, proof))
    )
      throw invalid()
    await ctx.db.patch(proof._id, { state: "exchanging" })
    return proof
  },
})
export const consume = internalMutation({
  args: { consent: v.id("twitchChatConsents"), evidence: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const proof = await ctx.db.get(args.consent)
    if (
      !proof ||
      proof.state !== "exchanging" ||
      !(await binding(ctx, proof)) ||
      backendEnv.TWITCH_CHAT_PRESENCE_ENABLED !== "true"
    )
      throw invalid()
    const account = await chatAccount(ctx, proof.userId)
    if (chatEvidence(account) !== args.evidence) throw invalid()
    const row = await ctx.db.get(proof.subscription)
    if (
      !row ||
      !chatRevoked(row) ||
      !row.consumers.includes(`chat:${proof.userId}`)
    )
      throw invalid()
    await ctx.db.patch(proof._id, { state: "consumed" })
    await ctx.db.patch(row._id, {
      authorizationRevoked: false,
      status: "connecting",
      consent: proof._id,
      failure: undefined,
      revision: row.revision + 1,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.twitchEventSubActions.reconcile, {
      subscription: row._id,
    })
    return null
  },
})
export const authorized = internalQuery({
  args: { subscription: v.id("twitchEventSubscriptions") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscription)
    const proof = row?.consent ? await ctx.db.get(row.consent) : null
    return (
      !!row &&
      !chatRevoked(row) &&
      !!proof &&
      proof.state === "consumed" &&
      proof.subscription === row._id &&
      (await binding(ctx, proof))
    )
  },
})
export const expire = internalMutation({
  args: { consent: v.id("twitchChatConsents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const proof = await ctx.db.get(args.consent)
    if (proof && proof.expiresAt <= Date.now()) await ctx.db.delete(proof._id)
    return null
  },
})

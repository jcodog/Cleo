import { ConvexError, v } from "convex/values"
import {
  compileModerationPolicy,
  MODERATION_ROLLOUT_LOCKED,
} from "@workspace/shared/moderation"
import {
  internalMutation,
  query,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { requireCurrentUser, requireDiscordGuildManager } from "./lib/auth"
import { moderationPlatform } from "./dbTables/communityIntegrations"
import { moderationRuntimeValue } from "./lib/communityValidators"
import { userDoc, linkedAccountDoc } from "./lib/validators"
import { chatAccount } from "./twitchChat"

const table = (platform: "discord" | "twitch") =>
  platform === "discord"
    ? "discordModerationPolicies"
    : "twitchModerationPolicies"
async function authority(
  ctx: QueryCtx | MutationCtx,
  platform: "discord" | "twitch",
  scopeId: string
) {
  const user = await requireCurrentUser(ctx)
  if (platform === "discord") {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) => q.eq("discordGuildId", scopeId))
      .unique()
    if (!guild || guild.botLeftAt !== undefined)
      throw new ConvexError("Cleo must be installed.")
    const membership = await requireDiscordGuildManager(ctx, guild._id)
    if ((membership.managementVerifiedAt ?? 0) < Date.now() - 300000)
      throw new ConvexError(
        "Refresh your Discord server permissions before editing moderation."
      )
  } else {
    const accounts = await ctx.db
      .query("linkedAccounts")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "twitch")
      )
      .take(2)
    if (accounts.length !== 1 || accounts[0]?.providerAccountId !== scopeId)
      throw new ConvexError("Verified broadcaster connection required.")
  }
  return user
}
export const get = query({
  args: { platform: moderationPlatform, scopeId: v.string() },
  returns: v.object({
    policyJSON: v.string(),
    revision: v.number(),
    enforcement: v.boolean(),
    health: v.string(),
  }),
  handler: async (ctx, args) => {
    await authority(ctx, args.platform, args.scopeId)
    const row = await ctx.db
      .query(table(args.platform))
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .unique()
    return row
      ? {
          policyJSON: row.policyJSON,
          revision: row.revision,
          enforcement: row.enforcement,
          health: row.health ?? "Runtime verification needed",
        }
      : {
          policyJSON: JSON.stringify(compileModerationPolicy().policy),
          revision: 0,
          enforcement: false,
          health: "Disabled until configured",
        }
  },
})
export const save = mutation({
  args: {
    platform: moderationPlatform,
    scopeId: v.string(),
    policyJSON: v.string(),
    expectedRevision: v.number(),
    enforcement: v.boolean(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await authority(ctx, args.platform, args.scopeId)
    if (args.policyJSON.length > 65536)
      throw new ConvexError("Moderation policy is too large.")
    const compiled = compileModerationPolicy(JSON.parse(args.policyJSON))
    if (
      MODERATION_ROLLOUT_LOCKED &&
      (args.enforcement ||
        Object.values(compiled.policy.rules).some((rule) => rule.enabled))
    )
      throw new ConvexError(
        "Moderation is not available in this release. Rules and enforcement cannot be enabled."
      )
    const row = await ctx.db
      .query(table(args.platform))
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .unique()
    if ((row?.revision ?? 0) !== args.expectedRevision)
      throw new ConvexError("Policy changed. Reload before saving.")
    const revision = args.expectedRevision + 1
    const value = {
      scopeId: args.scopeId,
      userId: user._id,
      policyJSON: JSON.stringify({ ...compiled.policy, revision }),
      revision,
      enforcement: args.enforcement,
      updatedAt: Date.now(),
      health: "Awaiting runtime verification",
    }
    if (row) await ctx.db.patch(row._id, value)
    else await ctx.db.insert(table(args.platform), value)
    return revision
  },
})
export const runtime = internalMutation({
  args: {
    platform: moderationPlatform,
    scopeId: v.string(),
    worker: v.string(),
    health: v.optional(v.string()),
  },
  returns: moderationRuntimeValue,
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query(table(args.platform))
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .unique()
    if (!row) return null
    const now = Date.now()
    let active: boolean
    if (args.platform === "discord") {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discord_guild_id", (q) =>
          q.eq("discordGuildId", args.scopeId)
        )
        .unique()
      active = !!guild && guild.botLeftAt === undefined
    } else {
      const user = await ctx.db.get(row.userId)
      const linked = await ctx.db
        .query("linkedAccounts")
        .withIndex("by_user_provider", (q) =>
          q.eq("userId", row.userId).eq("provider", "twitch")
        )
        .take(2)
      const subscriptions = await ctx.db
        .query("twitchEventSubscriptions")
        .withIndex("by_broadcaster_key", (q) =>
          q.eq("broadcasterId", args.scopeId).eq("key", "chatMessage")
        )
        .take(5)
      active =
        !!user &&
        user.status !== "disabled" &&
        linked.length === 1 &&
        linked[0]?.providerAccountId === args.scopeId &&
        subscriptions.some(
          (s) =>
            s.status === "ready" &&
            !s.authorizationRevoked &&
            s.consumers.includes(`chat:${row.userId}`)
        )
    }
    const ownsLease =
      active &&
      (!row.worker ||
        row.worker === args.worker ||
        (row.leaseUntil ?? 0) <= now)
    if (ownsLease)
      await ctx.db.patch(row._id, {
        worker: args.worker,
        leaseUntil: now + 60000,
        ...(args.health ? { health: args.health.slice(0, 200) } : {}),
      })
    return {
      revision: row.revision,
      policyJSON: row.policyJSON,
      enforcement: active && row.enforcement,
      authorityUntil: ownsLease ? now + 60000 : 0,
      leaseDurationMs: ownsLease ? 60000 : 0,
    }
  },
})
export const enforcementContext = internalMutation({
  args: { scopeId: v.string(), worker: v.string(), revision: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      user: v.union(userDoc, v.null()),
      discord: v.array(linkedAccountDoc),
      twitch: v.array(linkedAccountDoc),
      policyJSON: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("twitchModerationPolicies")
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .unique()
    if (
      !row ||
      !row.enforcement ||
      row.worker !== args.worker ||
      (row.leaseUntil ?? 0) <= Date.now() ||
      row.revision !== args.revision
    )
      return null
    const account = await chatAccount(ctx, row.userId)
    return { ...account, policyJSON: row.policyJSON }
  },
})
export const claimEnforcement = internalMutation({
  args: {
    platform: moderationPlatform,
    scopeId: v.string(),
    worker: v.string(),
    revision: v.number(),
    messageId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query(table(args.platform))
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .unique()
    if (
      !row?.enforcement ||
      row.worker !== args.worker ||
      (row.leaseUntil ?? 0) <= Date.now() ||
      row.revision !== args.revision ||
      !args.messageId ||
      args.messageId.length > 128
    )
      return false
    const provider = `${args.platform}-moderation`,
      key = `${args.scopeId}:${args.messageId}`
    if (
      await ctx.db
        .query("integrationReceipts")
        .withIndex("by_provider_key", (q) =>
          q.eq("provider", provider).eq("key", key)
        )
        .unique()
    )
      return false
    await ctx.db.insert("integrationReceipts", {
      provider,
      key,
      createdAt: Date.now(),
    })
    return true
  },
})

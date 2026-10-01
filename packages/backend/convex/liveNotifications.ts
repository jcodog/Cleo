import { ConvexError, v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation, internalQuery } from "./_generated/server"
import { requireCurrentUser, requireDiscordGuildManager } from "./lib/auth"
import { getOwnerTwitch } from "./lib/ownerTwitch"
import {
  insertDashboardGuildAuditEvent,
  insertGuildAuditEvent,
} from "./lib/guildAudit"
import { liveConfigFields } from "./dbTables/twitchLiveNotifications"
import {
  claimedLiveDelivery,
  liveConfigDoc,
  liveDeliveryDoc,
  liveEventDoc,
  liveSubscriptionDoc,
  linkedOwner,
  managedLiveConfig,
  ownerTwitch,
} from "./lib/twitchLiveValidators"
import { createLogger } from "@workspace/logger"

const logger = createLogger("twitch-live-notifications")
const defaultConfig = {
  liveNotificationsEnabled: false,
  liveNotificationMentionMode: "none" as const,
}

export const managed = internalQuery({
  returns: managedLiveConfig,
  args: { discordGuildId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    if (!guild) throw new ConvexError("Discord server not found.")
    const membership = await requireDiscordGuildManager(ctx, guild._id)
    const config = await ctx.db
      .query("guildLiveNotificationConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()
    return {
      guild,
      user,
      isOwner: membership.discordUserId === guild.ownerDiscordId,
      config: config ?? defaultConfig,
      owner: await getOwnerTwitch(ctx, guild._id),
    }
  },
})

export const owner = internalQuery({
  returns: ownerTwitch,
  args: { guildId: v.id("guilds") },
  handler: (ctx, args) => getOwnerTwitch(ctx, args.guildId),
})

export const configured = internalQuery({
  returns: v.array(v.object({ config: liveConfigDoc, owner: linkedOwner })),
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.db.query("guildLiveNotificationConfigs").take(501)
    if (configs.length > 500)
      throw new Error("Live notification reconciliation capacity exceeded.")
    const targets = []
    for (const config of configs) {
      if (!config.liveNotificationsEnabled || !config.liveNotificationChannelId)
        continue
      const source = await getOwnerTwitch(ctx, config.guildId)
      if (source.status === "linked" && source.guild.botLeftAt === undefined)
        targets.push({ config, owner: source })
    }
    return targets
  },
})

export const save = internalMutation({
  returns: v.null(),
  args: {
    discordGuildId: v.string(),
    ...liveConfigFields,
    expectedBroadcasterId: v.optional(v.string()),
    expectedOwnerDiscordId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx)
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    if (!guild) throw new ConvexError("Discord server not found.")
    await requireDiscordGuildManager(ctx, guild._id)
    if (guild.botLeftAt !== undefined)
      throw new ConvexError("Cleo is no longer in this server.")
    const source = await getOwnerTwitch(ctx, guild._id)
    if (
      args.liveNotificationsEnabled &&
      (source.status !== "linked" ||
        source.twitch.providerAccountId !== args.expectedBroadcasterId ||
        guild.ownerDiscordId !== args.expectedOwnerDiscordId)
    )
      throw new ConvexError(
        "The server owner's Twitch connection changed. Refresh and try again."
      )
    const previous = await ctx.db
      .query("guildLiveNotificationConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
      .unique()
    const next = {
      liveNotificationsEnabled: args.liveNotificationsEnabled,
      liveNotificationChannelId: args.liveNotificationChannelId,
      liveNotificationMentionMode: args.liveNotificationMentionMode,
      liveNotificationRoleId:
        args.liveNotificationMentionMode === "role"
          ? args.liveNotificationRoleId
          : undefined,
    }
    const now = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1)
    if (previous) await ctx.db.patch(previous._id, { ...next, updatedAt: now })
    else
      await ctx.db.insert("guildLiveNotificationConfigs", {
        guildId: guild._id,
        ...next,
        createdAt: now,
        updatedAt: now,
      })
    await insertDashboardGuildAuditEvent(ctx, {
      guild,
      user,
      eventType: "dashboard.guild_config.live_notifications_updated",
      summary: "Twitch live notification settings updated",
      metadata: {
        previous: previous ? auditConfig(previous) : null,
        next: auditConfig(next),
      },
    })
    return null
  },
})

function auditConfig(config: {
  liveNotificationsEnabled: boolean
  liveNotificationMentionMode: string
  liveNotificationChannelId?: string
  liveNotificationRoleId?: string
}) {
  return {
    enabled: config.liveNotificationsEnabled,
    channelId: config.liveNotificationChannelId ?? null,
    mentionMode: config.liveNotificationMentionMode,
    roleId: config.liveNotificationRoleId ?? null,
  }
}

export const receive = internalMutation({
  returns: v.id("twitchLiveEvents"),
  args: {
    broadcasterId: v.string(),
    streamId: v.string(),
    messageId: v.string(),
    login: v.string(),
    displayName: v.string(),
    startedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("twitchLiveEvents")
      .withIndex("by_broadcaster_stream", (q) =>
        q.eq("broadcasterId", args.broadcasterId).eq("streamId", args.streamId)
      )
      .unique()
    if (existing) return existing._id
    const id = await ctx.db.insert("twitchLiveEvents", {
      ...args,
      state: "pending",
      attempts: 0,
      createdAt: Date.now(),
    })
    await ctx.scheduler.runAfter(
      0,
      internal.liveNotificationActions.processEvent,
      { eventId: id }
    )
    return id
  },
})

export const event = internalQuery({
  returns: v.union(v.null(), liveEventDoc),
  args: { eventId: v.id("twitchLiveEvents") },
  handler: (ctx, args) => ctx.db.get(args.eventId),
})
export const delivery = internalQuery({
  returns: v.union(v.null(), liveDeliveryDoc),
  args: { deliveryId: v.id("twitchLiveDeliveries") },
  handler: (ctx, args) => ctx.db.get(args.deliveryId),
})

export const dispatch = internalMutation({
  returns: v.null(),
  args: {
    eventId: v.id("twitchLiveEvents"),
    targets: v.array(
      v.object({
        guildId: v.id("guilds"),
        ownerDiscordId: v.string(),
        login: v.string(),
        displayName: v.string(),
        title: v.optional(v.string()),
        category: v.optional(v.string()),
      })
    ),
    retry: v.boolean(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || event.state !== "pending") return null
    for (const target of args.targets) {
      const source = await getOwnerTwitch(ctx, target.guildId)
      if (
        source.status !== "linked" ||
        source.guild.botLeftAt !== undefined ||
        source.guild.ownerDiscordId !== target.ownerDiscordId ||
        source.twitch.providerAccountId !== event.broadcasterId
      )
        continue
      const config = await ctx.db
        .query("guildLiveNotificationConfigs")
        .withIndex("by_guild_id", (q) => q.eq("guildId", target.guildId))
        .unique()
      if (
        !config?.liveNotificationsEnabled ||
        !config.liveNotificationChannelId
      )
        continue
      const existing = await ctx.db
        .query("twitchLiveDeliveries")
        .withIndex("by_guild_stream", (q) =>
          q
            .eq("guildId", target.guildId)
            .eq("broadcasterId", event.broadcasterId)
            .eq("streamId", event.streamId)
        )
        .unique()
      if (existing) continue
      await ctx.db.insert("twitchLiveDeliveries", {
        guildId: target.guildId,
        eventId: event._id,
        broadcasterId: event.broadcasterId,
        streamId: event.streamId,
        login: target.login,
        displayName: target.displayName,
        startedAt: event.startedAt,
        ...(target.title !== undefined ? { title: target.title } : {}),
        ...(target.category !== undefined ? { category: target.category } : {}),
        state: "pending",
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
    const attempts = event.attempts + 1
    const failed = args.retry && attempts >= 3
    await ctx.db.patch(event._id, {
      attempts,
      state: args.retry ? (failed ? "failed" : "pending") : "processed",
      ...(failed ? { failure: "providerUnavailable" } : {}),
    })
    if (args.retry && !failed)
      await ctx.scheduler.runAfter(
        attempts * 30000,
        internal.liveNotificationActions.processEvent,
        { eventId: event._id }
      )
    if (failed)
      logger.error("Twitch live event processing exhausted retries", {
        eventId: event._id,
        broadcasterId: event.broadcasterId,
      })
    return null
  },
})

export const pending = internalQuery({
  returns: v.array(
    v.object({ delivery: liveDeliveryDoc, discordGuildId: v.string() })
  ),
  args: { discordGuildIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.discordGuildIds.length > 100)
      throw new Error("At most 100 guilds per delivery batch.")
    const jobs = []
    for (const discordGuildId of args.discordGuildIds) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discord_guild_id", (q) =>
          q.eq("discordGuildId", discordGuildId)
        )
        .unique()
      if (!guild) continue
      const pending = await ctx.db
        .query("twitchLiveDeliveries")
        .withIndex("by_guild_state", (q) =>
          q.eq("guildId", guild._id).eq("state", "pending")
        )
        .take(5)
      jobs.push(...pending.map((delivery) => ({ delivery, discordGuildId })))
      if (jobs.length >= 20) break
    }
    return jobs.slice(0, 20)
  },
})

export const claim = internalMutation({
  returns: v.union(v.null(), claimedLiveDelivery),
  args: { deliveryId: v.id("twitchLiveDeliveries"), claim: v.string() },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId)
    if (!delivery || delivery.state !== "pending") return null
    const guild = await ctx.db.get(delivery.guildId)
    const config = await ctx.db
      .query("guildLiveNotificationConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", delivery.guildId))
      .unique()
    const owner = await getOwnerTwitch(ctx, delivery.guildId)
    if (
      !guild ||
      guild.botLeftAt !== undefined ||
      !config?.liveNotificationsEnabled ||
      !config.liveNotificationChannelId ||
      owner.status !== "linked" ||
      owner.twitch.providerAccountId !== delivery.broadcasterId ||
      Date.now() - delivery.createdAt > 15 * 60000
    ) {
      await ctx.db.patch(delivery._id, {
        state: "cancelled",
        failure: "targetNoLongerEligible",
        updatedAt: Date.now(),
      })
      return null
    }
    const expiresAt = Date.now() + 90000
    await ctx.db.patch(delivery._id, {
      state: "claimed",
      claim: args.claim,
      claimExpiresAt: expiresAt,
      attempts: delivery.attempts + 1,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(90000, internal.liveNotifications.expire, {
      deliveryId: delivery._id,
      claim: args.claim,
    })
    return {
      ...delivery,
      discordGuildId: guild.discordGuildId,
      ownerDiscordId: guild.ownerDiscordId,
      claim: args.claim,
      config,
    }
  },
})

export const begin = internalMutation({
  returns: v.boolean(),
  args: {
    deliveryId: v.id("twitchLiveDeliveries"),
    claim: v.string(),
    configUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId)
    if (
      !delivery ||
      delivery.state !== "claimed" ||
      delivery.claim !== args.claim ||
      (delivery.claimExpiresAt ?? 0) <= Date.now()
    )
      return false
    const config = await ctx.db
      .query("guildLiveNotificationConfigs")
      .withIndex("by_guild_id", (q) => q.eq("guildId", delivery.guildId))
      .unique()
    const owner = await getOwnerTwitch(ctx, delivery.guildId)
    if (
      !config?.liveNotificationsEnabled ||
      config.updatedAt !== args.configUpdatedAt ||
      owner.status !== "linked" ||
      owner.guild.botLeftAt !== undefined ||
      owner.twitch.providerAccountId !== delivery.broadcasterId
    )
      return false
    await ctx.db.patch(delivery._id, {
      state: "sending",
      updatedAt: Date.now(),
    })
    return true
  },
})

export const finish = internalMutation({
  returns: v.union(v.null(), v.boolean()),
  args: {
    deliveryId: v.id("twitchLiveDeliveries"),
    claim: v.string(),
    messageId: v.optional(v.string()),
    failure: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId)
    if (
      !delivery ||
      delivery.claim !== args.claim ||
      !["claimed", "sending", "uncertain"].includes(delivery.state)
    )
      return null
    const state = args.messageId ? ("sent" as const) : ("failed" as const)
    await ctx.db.patch(delivery._id, {
      state,
      messageId: args.messageId,
      failure: args.failure,
      updatedAt: Date.now(),
    })
    const guild = await ctx.db.get(delivery.guildId)
    if (guild)
      await insertGuildAuditEvent(ctx, {
        guild,
        source: "bot-action",
        eventType: `bot.twitch_live_notification.${state}`,
        summary:
          state === "sent"
            ? "Twitch live notification delivered"
            : "Twitch live notification failed",
        metadata: {
          streamId: delivery.streamId,
          deliveryId: delivery._id,
          failure: args.failure ?? null,
          messageId: args.messageId ?? null,
        },
      })
    if (state === "failed")
      logger.error("Discord live notification failed", {
        deliveryId: delivery._id,
        guildId: delivery.guildId,
        failure: args.failure,
      })
    return true
  },
})

export const expire = internalMutation({
  returns: v.null(),
  args: { deliveryId: v.id("twitchLiveDeliveries"), claim: v.string() },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId)
    if (
      !delivery ||
      delivery.claim !== args.claim ||
      !["claimed", "sending"].includes(delivery.state)
    )
      return null
    const state =
      delivery.state === "sending"
        ? ("uncertain" as const)
        : delivery.attempts >= 3
          ? ("failed" as const)
          : ("pending" as const)
    await ctx.db.patch(delivery._id, {
      state,
      failure: state === "uncertain" ? "sendOutcomeUnknown" : "claimExpired",
      updatedAt: Date.now(),
    })
    logger.warn("Discord live notification claim expired", {
      deliveryId: delivery._id,
      state,
    })
    return null
  },
})

export const subscriptions = internalMutation({
  returns: v.null(),
  args: {
    states: v.array(
      v.object({
        broadcasterId: v.string(),
        status: v.union(
          v.literal("ready"),
          v.literal("pending"),
          v.literal("unavailable")
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.states.length > 500)
      throw new Error("Subscription status batch too large.")
    for (const state of args.states) {
      const previous = await ctx.db
        .query("twitchLiveSubscriptions")
        .withIndex("by_broadcaster", (q) =>
          q.eq("broadcasterId", state.broadcasterId)
        )
        .unique()
      if (previous)
        await ctx.db.patch(previous._id, {
          status: state.status,
          checkedAt: Date.now(),
        })
      else
        await ctx.db.insert("twitchLiveSubscriptions", {
          ...state,
          checkedAt: Date.now(),
        })
    }
    return null
  },
})

export const subscription = internalQuery({
  returns: v.union(v.null(), liveSubscriptionDoc),
  args: { broadcasterId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("twitchLiveSubscriptions")
      .withIndex("by_broadcaster", (q) =>
        q.eq("broadcasterId", args.broadcasterId)
      )
      .unique(),
})

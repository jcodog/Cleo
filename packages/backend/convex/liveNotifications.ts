import { ConvexError, v, type Infer } from "convex/values"
import { internal } from "./_generated/api"
import { query, internalMutation, internalQuery } from "./_generated/server"
import { requireCurrentUser, requireDiscordGuildManager } from "./lib/auth"
import {
  getOwnerTwitch,
  ownerEvidenceKey,
  createOwnerCache,
} from "./lib/ownerTwitch"
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
  linkedOwner,
  managedLiveConfig,
  ownerTwitch,
} from "./lib/twitchLiveValidators"
import { createLogger } from "@workspace/logger"
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

import { setEventConsumer } from "./lib/twitchConsumers"
import { backendEnv } from "@workspace/env/backend"
import { subscriptionStatus } from "./dbTables/twitchEventSub"
import { liveConfig, liveSource } from "./lib/twitchLiveValidators"
const logger = createLogger("twitch-live-notifications")
const defaultConfig = {
  liveNotificationsEnabled: false,
  liveNotificationMentionMode: "none" as const,
}

export const projection = query({
  args: { discordGuildId: v.string() },
  returns: v.object({
    config: liveConfig,
    source: liveSource,
    isOwner: v.boolean(),
    botLeft: v.boolean(),
    discordStatus: v.union(
      v.literal("ready"),
      v.literal("unavailable"),
      v.literal("needsChannel"),
      v.literal("needsRole")
    ),
    subscriptionStatus,
  }),
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx)
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) =>
        q.eq("discordGuildId", args.discordGuildId)
      )
      .unique()
    if (!guild) throw new ConvexError("Discord server not found.")
    const membership = await requireDiscordGuildManager(ctx, guild._id)
    const config =
      (await ctx.db
        .query("guildLiveNotificationConfigs")
        .withIndex("by_guild_id", (q) => q.eq("guildId", guild._id))
        .unique()) ?? defaultConfig
    const owner = await getOwnerTwitch(ctx, guild._id)
    const twitch =
      owner.status === "linked"
        ? "broadcasterId" in config && config.broadcasterId
          ? owner.twitchAccounts.find(
              (account) => account.providerAccountId === config.broadcasterId
            )
          : owner.twitchAccounts.length === 1
            ? owner.twitch
            : undefined
        : undefined
    // A query cannot verify Clerk/Twitch or live Discord permissions. Never
    // present stored account evidence as fresh authority; get() verifies it.
    const source = {
      status:
        owner.status === "needsLink"
          ? ("needsLink" as const)
          : ("stale" as const),
    }
    const broadcasterId =
      "broadcasterId" in config
        ? config.broadcasterId
        : twitch?.providerAccountId
    const subscription = broadcasterId
      ? (
          await ctx.db
            .query("twitchEventSubscriptions")
            .withIndex("by_broadcaster", (q) =>
              q.eq("broadcasterId", broadcasterId)
            )
            .collect()
        ).find(
          (row) =>
            row.key === "streamOnline" &&
            (row.consumers.includes(`guild:${guild._id}`) ||
              (!config.liveNotificationsEnabled &&
                !row.consumers.length &&
                ["failed", "providerUnavailable"].includes(row.status)))
        )
      : undefined
    return {
      config,
      source,
      isOwner: membership.discordUserId === guild.ownerDiscordId,
      botLeft: guild.botLeftAt !== undefined,
      discordStatus: config.liveNotificationsEnabled
        ? ("unavailable" as const)
        : ("ready" as const),
      subscriptionStatus: subscription?.status ?? ("disabled" as const),
    }
  },
})

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
const consumerArgs = {
  configId: v.id("guildLiveNotificationConfigs"),
  broadcasterId: v.string(),
  expectedOwnerEvidenceKey: v.string(),
  callback: v.string(),
  botId: v.string(),
}
const consumerValidator = v.object(consumerArgs)
async function ensureConsumerFor(
  ctx: MutationCtx,
  args: Infer<typeof consumerValidator>
): Promise<Id<"twitchEventSubscriptions">[]> {
  const config = await ctx.db.get(args.configId)
  if (!config?.liveNotificationsEnabled) return []
  const owner = await getOwnerTwitch(ctx, config.guildId)
  if (
    owner.status !== "linked" ||
    owner.guild.botLeftAt !== undefined ||
    ownerEvidenceKey(owner) !== args.expectedOwnerEvidenceKey ||
    !owner.twitchAccounts.some(
      (account) => account.providerAccountId === args.broadcasterId
    )
  )
    return []
  await ctx.db.patch(config._id, {
    broadcasterId: args.broadcasterId,
    ownerUserId: owner.user._id,
    ownerDiscordId: owner.guild.ownerDiscordId,
  })
  return setEventConsumer(ctx, {
    consumer: `guild:${config.guildId}`,
    key: "streamOnline",
    enabled: true,
    broadcasterId: args.broadcasterId,
    callback: args.callback,
    botId: args.botId,
  })
}
export const ensureConsumer = internalMutation({
  args: consumerArgs,
  returns: v.array(v.id("twitchEventSubscriptions")),
  handler: ensureConsumerFor,
})
export const ensureConsumerBatch = internalMutation({
  args: { targets: v.array(v.object(consumerArgs)) },
  returns: v.array(v.id("twitchEventSubscriptions")),
  handler: async (ctx, args) => {
    const touched = new Set<Id<"twitchEventSubscriptions">>()
    for (const target of args.targets)
      for (const id of await ensureConsumerFor(ctx, target)) touched.add(id)
    return [...touched]
  },
})

export const configured = internalQuery({
  returns: v.object({
    targets: v.array(
      v.object({
        config: liveConfigDoc,
        owner: linkedOwner,
      })
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  args: {
    cursor: v.optional(v.union(v.null(), v.string())),
    broadcasterId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const query = args.broadcasterId
      ? ctx.db
          .query("guildLiveNotificationConfigs")
          .withIndex("by_broadcaster", (q) =>
            q
              .eq("broadcasterId", args.broadcasterId)
              .eq("liveNotificationsEnabled", true)
          )
      : ctx.db
          .query("guildLiveNotificationConfigs")
          .withIndex("by_enabled", (q) =>
            q.eq("liveNotificationsEnabled", true)
          )
    const configs = await query.paginate({
      cursor: args.cursor ?? null,
      numItems: 25,
    })
    const owners = createOwnerCache()
    const targets = []
    for (const config of configs.page) {
      if (!config.liveNotificationsEnabled || !config.liveNotificationChannelId)
        continue
      const source = await getOwnerTwitch(ctx, config.guildId, owners)
      if (source.status === "linked" && source.guild.botLeftAt === undefined) {
        targets.push({
          config,
          owner: source,
        })
      }
    }
    return {
      targets,
      continueCursor: configs.continueCursor,
      isDone: configs.isDone,
    }
  },
})

export const save = internalMutation({
  returns: v.object({
    revision: v.number(),
    subscriptions: v.array(v.id("twitchEventSubscriptions")),
  }),
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
        !source.twitchAccounts.some(
          (account) => account.providerAccountId === args.expectedBroadcasterId
        ) ||
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
      broadcasterId: args.liveNotificationsEnabled
        ? args.expectedBroadcasterId
        : (args.expectedBroadcasterId ?? previous?.broadcasterId),
      ownerUserId:
        args.liveNotificationsEnabled && source.status === "linked"
          ? source.user._id
          : previous?.ownerUserId,
      ownerDiscordId: args.liveNotificationsEnabled
        ? guild.ownerDiscordId
        : previous?.ownerDiscordId,
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
    const subscriptions = await setEventConsumer(ctx, {
      consumer: `guild:${guild._id}`,
      key: "streamOnline",
      broadcasterId: next.broadcasterId,
      enabled: next.liveNotificationsEnabled,
      callback: backendEnv.TWITCH_EVENTSUB_CALLBACK_URL ?? "",
      botId: backendEnv.TWITCH_BOT_USER_ID ?? "",
    })
    return { revision: now, subscriptions }
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
  returns: v.union(v.id("twitchLiveEvents"), v.null()),
  args: {
    broadcasterId: v.string(),
    streamId: v.string(),
    messageId: v.string(),
    login: v.string(),
    displayName: v.string(),
    startedAt: v.string(),
  },
  handler: async (ctx, args) => {
    // Once dedupe rows expire, an old session must never become a new delivery.
    if (Date.parse(args.startedAt) < Date.now() - 30 * 86400000) return null
    const existing = await ctx.db
      .query("twitchLiveEvents")
      .withIndex("by_broadcaster_stream", (q) =>
        q.eq("broadcasterId", args.broadcasterId).eq("streamId", args.streamId)
      )
      .unique()
    if (existing) return existing._id
    const receipt = await ctx.db
      .query("twitchWebhookReceipts")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .unique()
    if (receipt) return null
    await ctx.db.insert("twitchWebhookReceipts", {
      messageId: args.messageId,
      createdAt: Date.now(),
    })
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

export const cleanup = internalMutation({
  returns: v.null(),
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 31 * 86400000
    const deliveries = await ctx.db
      .query("twitchLiveDeliveries")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(100)
    for (const delivery of deliveries) await ctx.db.delete(delivery._id)
    const events = await ctx.db
      .query("twitchLiveEvents")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(100)
    for (const event of events) await ctx.db.delete(event._id)
    if (deliveries.length === 100 || events.length === 100)
      await ctx.scheduler.runAfter(1000, internal.liveNotifications.cleanup, {})
    return null
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
    complete: v.optional(v.boolean()),
    targets: v.array(
      v.object({
        guildId: v.id("guilds"),
        ownerDiscordId: v.string(),
        login: v.string(),
        displayName: v.string(),
        title: v.optional(v.string()),
        category: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
        viewerCount: v.optional(v.number()),
      })
    ),
    retry: v.boolean(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || event.state !== "pending") return null
    if (args.targets.length > 25)
      throw new Error("Event dispatch batch too large.")
    const owners = createOwnerCache()
    for (const target of args.targets) {
      const source = await getOwnerTwitch(ctx, target.guildId, owners)
      if (
        source.status !== "linked" ||
        source.guild.botLeftAt !== undefined ||
        source.guild.ownerDiscordId !== target.ownerDiscordId ||
        !source.twitchAccounts.some(
          (account) => account.providerAccountId === event.broadcasterId
        )
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
      const deliveryId = await ctx.db.insert("twitchLiveDeliveries", {
        guildId: target.guildId,
        discordGuildId: source.guild.discordGuildId,
        eventId: event._id,
        broadcasterId: event.broadcasterId,
        streamId: event.streamId,
        login: target.login,
        displayName: target.displayName,
        startedAt: event.startedAt,
        ...(target.title !== undefined ? { title: target.title } : {}),
        ...(target.category !== undefined ? { category: target.category } : {}),
        ...(target.avatarUrl !== undefined
          ? { avatarUrl: target.avatarUrl }
          : {}),
        ...(target.previewUrl !== undefined
          ? { previewUrl: target.previewUrl }
          : {}),
        ...(target.viewerCount !== undefined
          ? { viewerCount: target.viewerCount }
          : {}),
        state: "pending",
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await ctx.scheduler.runAfter(
        0,
        internal.liveNotificationActions.deliver,
        { deliveryId }
      )
    }
    if (args.complete === false) return null
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

export const claim = internalMutation({
  returns: v.union(v.null(), claimedLiveDelivery),
  args: { deliveryId: v.id("twitchLiveDeliveries"), claim: v.string() },
  handler: (ctx, args) => claimDelivery(ctx, args),
})

async function claimDelivery(
  ctx: MutationCtx,
  args: { deliveryId: Id<"twitchLiveDeliveries">; claim: string },
  owners = createOwnerCache()
) {
  const delivery = await ctx.db.get(args.deliveryId)
  if (!delivery || delivery.state !== "pending") return null
  const guild = await ctx.db.get(delivery.guildId)
  const config = await ctx.db
    .query("guildLiveNotificationConfigs")
    .withIndex("by_guild_id", (q) => q.eq("guildId", delivery.guildId))
    .unique()
  const owner = await getOwnerTwitch(ctx, delivery.guildId, owners)
  if (
    !guild ||
    guild.botLeftAt !== undefined ||
    !config?.liveNotificationsEnabled ||
    !config.liveNotificationChannelId ||
    owner.status !== "linked" ||
    !owner.twitchAccounts.some(
      (account) => account.providerAccountId === delivery.broadcasterId
    )
  ) {
    await ctx.db.patch(delivery._id, {
      state: "cancelled",
      failure: "targetNoLongerEligible",
      updatedAt: Date.now(),
    })
    if (guild)
      await insertGuildAuditEvent(ctx, {
        guild,
        source: "bot-action",
        eventType: "bot.twitch_live_notification.cancelled",
        summary: "Twitch live notification target no longer eligible",
        metadata: {
          deliveryId: delivery._id,
          streamId: delivery.streamId,
          failure: "targetNoLongerEligible",
        },
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
}

export const begin = internalMutation({
  returns: v.boolean(),
  args: {
    deliveryId: v.id("twitchLiveDeliveries"),
    claim: v.string(),
    configUpdatedAt: v.number(),
    expectedOwnerEvidenceKey: v.string(),
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
      ownerEvidenceKey(owner) !== args.expectedOwnerEvidenceKey ||
      owner.guild.botLeftAt !== undefined ||
      !owner.twitchAccounts.some(
        (account) => account.providerAccountId === delivery.broadcasterId
      )
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
    if (args.messageId && delivery.state === "claimed") return null
    const preflight = [
      "destinationUnavailable",
      "ownerChanged",
      "missingDiscordPermission",
      "missingMentionPermission",
      "roleUnavailable",
      "streamEnded",
      "ownerAuthorityRevoked",
    ]
    if (
      !args.messageId &&
      delivery.state === "claimed" &&
      !preflight.includes(args.failure ?? "")
    )
      return null
    const state = args.messageId
      ? ("sent" as const)
      : delivery.state === "claimed"
        ? ("failed" as const)
        : ("uncertain" as const)
    const failure = state === "uncertain" ? "sendOutcomeUnknown" : args.failure
    if (
      delivery.state === state &&
      delivery.messageId === args.messageId &&
      delivery.failure === failure
    )
      return true
    await ctx.db.patch(delivery._id, {
      state,
      messageId: args.messageId,
      failure,
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
            : state === "uncertain"
              ? "Twitch live notification send outcome unknown"
              : "Twitch live notification failed",
        metadata: {
          streamId: delivery.streamId,
          deliveryId: delivery._id,
          failure: failure ?? null,
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
    if (state === "pending")
      await ctx.scheduler.runAfter(
        0,
        internal.liveNotificationActions.deliver,
        { deliveryId: delivery._id }
      )
    logger.warn("Discord live notification claim expired", {
      deliveryId: delivery._id,
      state,
    })
    const guild =
      state !== "pending" ? await ctx.db.get(delivery.guildId) : null
    if (guild)
      await insertGuildAuditEvent(ctx, {
        guild,
        source: "bot-action",
        eventType: `bot.twitch_live_notification.${state}`,
        summary:
          state === "uncertain"
            ? "Twitch live notification send outcome unknown"
            : "Twitch live notification attempts exhausted",
        metadata: {
          deliveryId: delivery._id,
          streamId: delivery.streamId,
          failure:
            state === "uncertain" ? "sendOutcomeUnknown" : "claimExpired",
        },
      })
    return null
  },
})

// Explicit rollout operation for rows formerly owned by the removed Gateway worker.
export const migrateDeliveries = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    scheduled: v.number(),
    uncertain: v.number(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("twitchLiveDeliveries")
      .paginate({ numItems: 25, cursor: args.cursor ?? null })
    let scheduled = 0,
      uncertain = 0
    for (const row of page.page) {
      if (row.state === "sending") {
        await ctx.db.patch(row._id, {
          state: "uncertain",
          failure: "rolloutInterruptedSend",
          updatedAt: Date.now(),
        })
        uncertain++
      } else if (row.state === "pending" || row.state === "claimed") {
        // The retired worker had not reserved a POST in claimed state. Releasing
        // its claim also makes any late old-worker begin call fail atomically.
        if (row.state === "claimed")
          await ctx.db.patch(row._id, {
            state: "pending",
            claim: undefined,
            claimExpiresAt: undefined,
            updatedAt: Date.now(),
          })
        await ctx.scheduler.runAfter(
          0,
          internal.liveNotificationActions.deliver,
          { deliveryId: row._id }
        )
        scheduled++
      }
    }
    return {
      scheduled,
      uncertain,
      cursor: page.isDone ? null : page.continueCursor,
    }
  },
})

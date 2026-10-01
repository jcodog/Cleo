"use node"

import { randomUUID } from "node:crypto"
import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { action, internalAction } from "./_generated/server"
import { api, internal } from "./_generated/api"
import { liveConfigFields } from "./dbTables/twitchLiveNotifications"
import type { Infer } from "convex/values"
import { publicOwnerTwitch, verifyOwnerTwitch } from "./lib/verifyOwnerTwitch"
import {
  verifyBotCanAccessDiscordGuild,
  verifyUserCanManageDiscordGuild,
} from "./actions/dashboard/discord/lib/restAccess"
import {
  fetchDiscordGuildChannels,
  fetchDiscordGuildRoles,
} from "./lib/discordRest"
import { liveWorkspace } from "./lib/twitchLiveValidators"
import type { Doc } from "./_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { ownerEvidenceKey } from "./lib/ownerTwitch"
import { boundedMap } from "./lib/boundedMap"
import { createLogger } from "@workspace/logger"

import { controlPlaneConfig, assertWorkerSecret } from "./twitchEventSubActions"
import {
  eventDefinitions,
  resolveBroadcasterScopes,
} from "@workspace/shared/twitchEventSub"
import { z } from "zod"
import { buildTwitchLiveCard } from "./lib/twitchLiveCard"
import { validateLiveDestination } from "./lib/twitchDiscordDestination"
const logger = createLogger("twitch-live-delivery-authority")

async function getDiscordDestinationStatus(
  config: Infer<typeof liveWorkspace>["config"],
  discordGuildId: string
): Promise<Infer<typeof liveWorkspace>["discordStatus"]> {
  if (!config.liveNotificationsEnabled) return "ready"
  if (!config.liveNotificationChannelId) return "needsChannel"
  const token = backendEnv.DISCORD_BOT_TOKEN
  if (!token) return "unavailable"
  const channels = await fetchDiscordGuildChannels(discordGuildId, token)
  if (channels.status !== "ready") return "unavailable"
  if (
    !channels.channels.some(
      (channel) =>
        channel.discordChannelId === config.liveNotificationChannelId &&
        (channel.type === "text" || channel.type === "announcement")
    )
  )
    return "needsChannel"
  if (config.liveNotificationMentionMode === "role") {
    const roles = await fetchDiscordGuildRoles(discordGuildId, token)
    if (!roles) return "unavailable"
    if (
      !roles.some(
        (role) =>
          role.discordRoleId === config.liveNotificationRoleId &&
          role.discordRoleId !== discordGuildId &&
          !role.managed
      )
    )
      return "needsRole"
  }
  return "ready"
}

export const get = action({
  returns: liveWorkspace,
  args: { discordGuildId: v.string() },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.liveNotifications.managed, args)
    const source = await verifyOwnerTwitch(
      context.owner,
      resolveBroadcasterScopes(["streamOnline"]),
      backendEnv.TWITCH_CLIENT_ID ?? "unconfigured"
    )
    const view = await ctx.runQuery(api.liveNotifications.projection, args)
    return {
      config: context.config,
      source: publicOwnerTwitch(source),
      isOwner: context.isOwner,
      botLeft: context.guild.botLeftAt !== undefined,
      discordStatus: await getDiscordDestinationStatus(
        context.config,
        args.discordGuildId
      ),
      subscriptionStatus: view.subscriptionStatus,
    }
  },
})

export const update = action({
  returns: v.number(),
  args: {
    discordGuildId: v.string(),
    ...liveConfigFields,
    retry: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.liveNotifications.managed, {
      discordGuildId: args.discordGuildId,
    })
    if (context.guild.botLeftAt !== undefined)
      throw new ConvexError("Cleo is no longer in this server.")
    const manager = await verifyUserCanManageDiscordGuild({
      clerkUserId: context.user.clerkUserId,
      discordGuildId: args.discordGuildId,
    })
    if (manager.status !== "ready")
      throw new ConvexError(
        manager.status === "forbidden"
          ? "Manage Server permission is required."
          : "Discord management authority is unavailable. Try again."
      )
    const bot = await verifyBotCanAccessDiscordGuild(args.discordGuildId)
    if (bot.status !== "ready")
      throw new ConvexError("Cleo's Discord access is unavailable.")
    if (bot.guild.ownerDiscordId !== context.guild.ownerDiscordId)
      throw new ConvexError(
        "The server owner changed. Refresh the server before configuring notifications."
      )
    const source = await verifyOwnerTwitch(
      context.owner,
      resolveBroadcasterScopes(["streamOnline"]),
      args.liveNotificationsEnabled ? controlPlaneConfig().clientId : undefined
    )
    if (args.liveNotificationsEnabled && source.status !== "ready")
      throw new ConvexError(
        "The server owner must connect or reconnect Twitch before enabling notifications."
      )
    const channelId = args.liveNotificationChannelId
    const roleId =
      args.liveNotificationMentionMode === "role"
        ? args.liveNotificationRoleId
        : undefined
    if (channelId !== undefined && !/^\d{17,20}$/.test(channelId))
      throw new ConvexError("Invalid Discord channel.")
    if (roleId !== undefined && !/^\d{17,20}$/.test(roleId))
      throw new ConvexError("Invalid Discord role.")
    if (args.liveNotificationsEnabled && !channelId)
      throw new ConvexError("Choose a notification channel.")
    if (args.liveNotificationMentionMode === "role" && !roleId)
      throw new ConvexError("Choose a custom role.")
    const token = backendEnv.DISCORD_BOT_TOKEN
    if (!token) throw new ConvexError("Discord is unavailable.")
    // Disabling can preserve a previously validated destination that was deleted.
    if (
      channelId &&
      (args.liveNotificationsEnabled ||
        channelId !== context.config.liveNotificationChannelId)
    ) {
      const channels = await fetchDiscordGuildChannels(
        args.discordGuildId,
        token
      )
      if (channels.status !== "ready")
        throw new ConvexError("Discord channels are unavailable.")
      if (
        !channels.channels.some(
          (channel) =>
            channel.discordChannelId === channelId &&
            (channel.type === "text" || channel.type === "announcement")
        )
      )
        throw new ConvexError(
          "Choose an existing text or announcement channel in this server."
        )
    }
    if (
      roleId &&
      (args.liveNotificationsEnabled ||
        roleId !== context.config.liveNotificationRoleId)
    ) {
      const roles = await fetchDiscordGuildRoles(args.discordGuildId, token)
      if (!roles) throw new ConvexError("Discord roles are unavailable.")
      if (
        !roles.some(
          (role) =>
            role.discordRoleId === roleId &&
            role.discordRoleId !== args.discordGuildId &&
            role.name !== "@everyone" &&
            !role.managed
        )
      )
        throw new ConvexError("Choose an existing custom role in this server.")
    }
    const { retry, ...configuration } = args
    const savedRevision = await ctx.runMutation(
      internal.liveNotifications.save,
      {
        ...configuration,
        liveNotificationRoleId: roleId,
        ...(source.status === "ready"
          ? {
              expectedBroadcasterId: source.broadcasterId,
              expectedOwnerDiscordId: context.guild.ownerDiscordId,
            }
          : {}),
      }
    )
    if (
      retry ||
      context.config.liveNotificationsEnabled !==
        args.liveNotificationsEnabled ||
      (source.status === "ready" &&
        "broadcasterId" in context.config &&
        context.config.broadcasterId !== source.broadcasterId)
    ) {
      const subscriptions = await ctx.runQuery(
        internal.twitchEventSub.guildTargets,
        {
          broadcasterId:
            source.status === "ready"
              ? source.broadcasterId
              : "broadcasterId" in context.config
                ? context.config.broadcasterId
                : undefined,
        }
      )
      for (const subscription of subscriptions)
        await ctx.runAction(internal.twitchEventSubActions.reconcile, {
          subscription,
        })
    }
    return savedRevision
  },
})

type Target = {
  guildId: Doc<"guilds">["_id"]
  ownerDiscordId: string
  login: string
  displayName: string
  title?: string
  category?: string
  avatarUrl?: string
  previewUrl?: string
  viewerCount?: number
}

async function streamSession(
  source: Extract<
    Awaited<ReturnType<typeof verifyOwnerTwitch>>,
    { status: "ready" }
  >,
  streamId: string
) {
  const response = await fetch(
    `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(source.broadcasterId)}`,
    {
      headers: {
        Authorization: `Bearer ${source.accessToken}`,
        "Client-Id": source.clientId,
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    }
  )
  if (!response.ok) throw new Error("Twitch stream state unavailable.")
  const value: unknown = await response.json()
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    !Array.isArray(value.data)
  )
    throw new Error("Twitch stream state malformed.")
  const stream: unknown = value.data.find(
    (entry: unknown) =>
      entry &&
      typeof entry === "object" &&
      "id" in entry &&
      entry.id === streamId
  )
  return {
    live: !!stream,
    metadata:
      stream && typeof stream === "object"
        ? {
            ...("title" in stream && typeof stream.title === "string"
              ? { title: stream.title.slice(0, 500) }
              : {}),
            ...("thumbnail_url" in stream &&
            typeof stream.thumbnail_url === "string"
              ? {
                  previewUrl: stream.thumbnail_url
                    .replaceAll("{width}", "640")
                    .replaceAll("{height}", "360"),
                }
              : {}),
            ...("viewer_count" in stream &&
            typeof stream.viewer_count === "number" &&
            Number.isSafeInteger(stream.viewer_count) &&
            stream.viewer_count >= 0
              ? { viewerCount: stream.viewer_count }
              : {}),
            ...("game_name" in stream && typeof stream.game_name === "string"
              ? { category: stream.game_name.slice(0, 100) }
              : {}),
          }
        : {},
  }
}

// Explicit migration/repair operation. Never scheduled as a recurring sync.
export const migrateConsumers = internalAction({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    migrated: v.number(),
    skipped: v.number(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const config = controlPlaneConfig()
    const page = await ctx.runQuery(internal.liveNotifications.configured, {
      cursor: args.cursor,
    })
    let migrated = 0
    let skipped = 0
    const owners = new Map<
      string,
      Awaited<ReturnType<typeof verifyOwnerTwitch>>
    >()
    for (const target of page.targets) {
      let source = owners.get(target.owner.user._id)
      if (!source) {
        source = await verifyOwnerTwitch(
          target.owner,
          resolveBroadcasterScopes(["streamOnline"]),
          config.clientId
        )
        owners.set(target.owner.user._id, source)
      }
      if (source.status !== "ready") {
        skipped++
        continue
      }
      const subscriptions = await ctx.runMutation(
        internal.liveNotifications.ensureConsumer,
        {
          configId: target.config._id,
          broadcasterId: source.broadcasterId,
          expectedOwnerEvidenceKey: ownerEvidenceKey(target.owner),
          callback: config.callback,
          botId: config.botId,
        }
      )
      for (const subscription of subscriptions)
        await ctx.runAction(internal.twitchEventSubActions.reconcile, {
          subscription,
        })
      migrated++
    }
    return {
      migrated,
      skipped,
      cursor: page.isDone ? null : page.continueCursor,
    }
  },
})

export const processEvent = internalAction({
  returns: v.null(),
  args: { eventId: v.id("twitchLiveEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.runQuery(internal.liveNotifications.event, args)
    if (!event || event.state !== "pending") return null
    const owners = new Map<
      string,
      Awaited<ReturnType<typeof verifyOwnerTwitch>>
    >()
    let metadata:
      | {
          title?: string
          category?: string
          previewUrl?: string
          avatarUrl?: string
          viewerCount?: number
        }
      | undefined
    let cursor: string | null = null
    let retry = false
    try {
      do {
        const page: FunctionReturnType<
          typeof internal.liveNotifications.configured
        > = await ctx.runQuery(internal.liveNotifications.configured, {
          broadcasterId: event.broadcasterId,
          cursor,
        })
        const unique = [
          ...new Map(
            page.targets.map((target) => [target.owner.user._id, target.owner])
          ).values(),
        ].filter((owner) => !owners.has(owner.user._id))
        await boundedMap(unique, 8, async (owner) => {
          owners.set(
            owner.user._id,
            await verifyOwnerTwitch(
              owner,
              resolveBroadcasterScopes(["streamOnline"]),
              backendEnv.TWITCH_CLIENT_ID ?? "unconfigured"
            )
          )
        })
        const targets: Target[] = []
        for (const target of page.targets) {
          const source = owners.get(target.owner.user._id)!
          if (source.status === "unavailable") {
            retry = true
            continue
          }
          if (
            source.status !== "ready" ||
            source.broadcasterId !== event.broadcasterId
          )
            continue
          if (!metadata) {
            try {
              metadata = (await streamSession(source, event.streamId)).metadata
              try {
                const response = await fetch(
                  `https://api.twitch.tv/helix/users?id=${event.broadcasterId}`,
                  {
                    headers: {
                      Authorization: `Bearer ${source.accessToken}`,
                      "Client-Id": source.clientId,
                    },
                    signal: AbortSignal.timeout(10000),
                    redirect: "error",
                  }
                )
                if (response.ok) {
                  const users = z
                    .object({
                      data: z.array(
                        z.object({ profile_image_url: z.string() })
                      ),
                    })
                    .parse(await response.json())
                  metadata.avatarUrl = users.data[0]?.profile_image_url
                }
              } catch {
                /* Avatar is optional. */
              }
            } catch {
              metadata = {}
            }
          }
          targets.push({
            guildId: target.config.guildId,
            ownerDiscordId: target.owner.discord.providerAccountId,
            login: source.login,
            displayName: event.displayName,
            ...metadata,
          })
        }
        await ctx.runMutation(internal.liveNotifications.dispatch, {
          eventId: event._id,
          targets,
          retry: false,
          complete: false,
        })
        cursor = page.isDone ? null : page.continueCursor
      } while (cursor)
    } catch {
      retry = true
    }
    await ctx.runMutation(internal.liveNotifications.dispatch, {
      eventId: event._id,
      targets: [],
      retry,
    })
    return null
  },
})

export const begin = internalAction({
  returns: v.boolean(),
  args: {
    deliveryId: v.id("twitchLiveDeliveries"),
    claim: v.string(),
    configUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(internal.liveNotifications.delivery, {
      deliveryId: args.deliveryId,
    })
    if (!delivery) return false
    const owner = await ctx.runQuery(internal.liveNotifications.owner, {
      guildId: delivery.guildId,
    })
    const source = await verifyOwnerTwitch(
      owner,
      resolveBroadcasterScopes(["streamOnline"]),
      backendEnv.TWITCH_CLIENT_ID ?? "unconfigured"
    )
    if (
      source.status !== "ready" ||
      source.broadcasterId !== delivery.broadcasterId
    ) {
      if (source.status !== "unavailable")
        await ctx.runMutation(internal.liveNotifications.finish, {
          deliveryId: delivery._id,
          claim: args.claim,
          failure: "ownerAuthorityRevoked",
        })
      return false
    }
    if (Date.now() - delivery.createdAt > 15 * 60000) {
      try {
        if (!(await streamSession(source, delivery.streamId)).live) {
          await ctx.runMutation(internal.liveNotifications.finish, {
            deliveryId: delivery._id,
            claim: args.claim,
            failure: "streamEnded",
          })
          return false
        }
      } catch {
        logger.warn(
          "Delayed live delivery stream state unavailable; claim will expire",
          { deliveryId: delivery._id }
        )
        return false
      }
    }
    const input = args
    return ctx.runMutation(internal.liveNotifications.begin, {
      ...input,
      expectedOwnerEvidenceKey:
        owner.status === "linked" ? ownerEvidenceKey(owner) : "",
    })
  },
})

export const receiveOnline = action({
  args: { secret: v.string(), messageId: v.string(), event: v.any() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertWorkerSecret(args.secret)
    const event = eventDefinitions.streamOnline.parse(args.event)
    await ctx.runMutation(internal.liveNotifications.receive, {
      broadcasterId: event.broadcaster_user_id,
      streamId: event.id,
      messageId: args.messageId,
      login: event.broadcaster_user_login.toLowerCase(),
      displayName: event.broadcaster_user_name,
      startedAt: event.started_at,
    })
    return null
  },
})

export const deliver = internalAction({
  args: { deliveryId: v.id("twitchLiveDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = randomUUID()
    const job = await ctx.runMutation(internal.liveNotifications.claim, {
      ...args,
      claim,
    })
    if (!job) return null
    const outcome = { deliveryId: job._id, claim }
    let reserved = false
    try {
      const token = backendEnv.DISCORD_BOT_TOKEN
      if (!token) throw new Error("providerUnavailable")
      if (!job.config.liveNotificationChannelId)
        throw new Error("destinationUnavailable")
      await validateLiveDestination({
        guildId: job.discordGuildId,
        ownerDiscordId: job.ownerDiscordId,
        channelId: job.config.liveNotificationChannelId,
        mentionMode: job.config.liveNotificationMentionMode,
        roleId: job.config.liveNotificationRoleId,
        token,
      })
      const payload = buildTwitchLiveCard({
        deliveryId: job._id,
        login: job.login,
        displayName: job.displayName,
        title: job.title,
        category: job.category,
        startedAt: job.startedAt,
        previewUrl: job.previewUrl,
        avatarUrl: job.avatarUrl,
        viewerCount: job.viewerCount,
        mentionMode: job.config.liveNotificationMentionMode,
        roleId: job.config.liveNotificationRoleId,
      })
      if (
        !(await ctx.runAction(internal.liveNotificationActions.begin, {
          ...outcome,
          configUpdatedAt: job.config.updatedAt,
        }))
      )
        return null
      reserved = true
      // One POST. Never retry after send reservation, including a lost response or 429.
      const response = await fetch(
        `https://discord.com/api/v10/channels/${job.config.liveNotificationChannelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        }
      )
      if (!response.ok) throw new Error("sendOutcomeUnknown")
      const message = z
        .object({ id: z.string().regex(/^\d{17,20}$/) })
        .parse(await response.json())
      await ctx.runMutation(internal.liveNotifications.finish, {
        ...outcome,
        messageId: message.id,
      })
    } catch (error) {
      const failure =
        error instanceof Error ? error.message : "providerUnavailable"
      if (reserved)
        await ctx.runMutation(internal.liveNotifications.finish, {
          ...outcome,
          failure: "sendOutcomeUnknown",
        })
      else if (
        [
          "destinationUnavailable",
          "ownerChanged",
          "missingDiscordPermission",
          "missingMentionPermission",
          "roleUnavailable",
        ].includes(failure)
      )
        await ctx.runMutation(internal.liveNotifications.finish, {
          ...outcome,
          failure,
        })
      // Transient preflight failure leaves the lease for durable bounded expiry/retry.
      logger.warn("Discord live delivery unavailable", {
        deliveryId: job._id,
        reserved,
      })
    }
    return null
  },
})

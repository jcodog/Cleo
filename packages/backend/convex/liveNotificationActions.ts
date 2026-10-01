"use node"

import { randomUUID } from "node:crypto"
import { ConvexError, v } from "convex/values"
import { backendEnv } from "@workspace/env/backend"
import { action, internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
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
import { assertValidBotSecret } from "./actions/bot/discord/lib/auth"
import { claimedLiveDelivery, liveWorkspace } from "./lib/twitchLiveValidators"
import type { Doc } from "./_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { ownerEvidenceKey } from "./lib/ownerTwitch"
import { boundedMap } from "./lib/boundedMap"
import { createLogger } from "@workspace/logger"

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
    const source = await verifyOwnerTwitch(context.owner)
    const subscription =
      source.status === "ready"
        ? await ctx.runQuery(internal.liveNotifications.subscription, {
            broadcasterId: source.broadcasterId,
          })
        : null
    return {
      config: context.config,
      source: publicOwnerTwitch(source),
      isOwner: context.isOwner,
      botLeft: context.guild.botLeftAt !== undefined,
      discordStatus: await getDiscordDestinationStatus(
        context.config,
        args.discordGuildId
      ),
      subscriptionStatus:
        subscription && Date.now() - subscription.checkedAt < 15 * 60000
          ? subscription.status
          : ("unavailable" as const),
    }
  },
})

export const update = action({
  returns: v.number(),
  args: { discordGuildId: v.string(), ...liveConfigFields },
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
    const source = await verifyOwnerTwitch(context.owner)
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
    return ctx.runMutation(internal.liveNotifications.save, {
      ...args,
      liveNotificationRoleId: roleId,
      ...(source.status === "ready"
        ? {
            expectedBroadcasterId: source.broadcasterId,
            expectedOwnerDiscordId: context.guild.ownerDiscordId,
          }
        : {}),
    })
  },
})

export const runtimeSources = internalAction({
  returns: v.object({
    broadcasterIds: v.array(v.string()),
    continueCursor: v.union(v.null(), v.string()),
  }),
  args: { cursor: v.optional(v.union(v.null(), v.string())) },
  handler: async (ctx, args) => {
    const page = await ctx.runQuery(internal.liveNotifications.configured, args)
    const owners = new Map(
      page.targets.map((target) => [target.owner.user._id, target])
    )
    const checked = await boundedMap(
      [...owners.values()],
      8,
      async (target) => {
        const key = ownerEvidenceKey(target.owner)
        const check = target.check
        if (
          check?.evidenceKey === key &&
          Date.now() - check.checkedAt < 5 * 60000
        )
          return {
            userId: target.owner.user._id,
            key,
            status: check.status,
            broadcasterId: check.broadcasterId,
          }
        const source = await verifyOwnerTwitch(target.owner)
        if (source.status === "unavailable")
          throw new Error("Owner Twitch authority is unavailable.")
        return {
          userId: target.owner.user._id,
          key,
          status:
            source.status === "ready"
              ? ("ready" as const)
              : source.status === "missingPermission"
                ? ("missingPermission" as const)
                : ("stale" as const),
          broadcasterId:
            source.status === "ready" ? source.broadcasterId : undefined,
        }
      }
    )
    const byOwner = new Map(checked.map((check) => [check.userId, check]))
    await ctx.runMutation(internal.liveNotifications.projectSources, {
      sources: page.targets.map((target) => {
        const source = byOwner.get(target.owner.user._id)!
        return {
          configId: target.config._id,
          evidenceKey: source.key,
          status: source.status,
          broadcasterId: source.broadcasterId,
        }
      }),
    })
    return {
      broadcasterIds: [
        ...new Set(
          checked
            .filter((check) => check.status === "ready")
            .map((check) => check.broadcasterId!)
        ),
      ],
      continueCursor: page.isDone ? null : page.continueCursor,
    }
  },
})

type Target = {
  guildId: Doc<"guilds">["_id"]
  ownerDiscordId: string
  login: string
  displayName: string
  title?: string
  category?: string
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
            ...("game_name" in stream && typeof stream.game_name === "string"
              ? { category: stream.game_name.slice(0, 100) }
              : {}),
          }
        : {},
  }
}

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
    let metadata: { title?: string; category?: string } | undefined
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
          owners.set(owner.user._id, await verifyOwnerTwitch(owner))
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
            } catch {
              metadata = {}
            }
          }
          targets.push({
            guildId: target.config.guildId,
            ownerDiscordId: target.owner.discord.providerAccountId,
            login: source.login,
            displayName: source.displayName,
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

export const claim = action({
  returns: v.object({
    deliveries: v.array(claimedLiveDelivery),
    continueCursor: v.union(v.null(), v.string()),
  }),
  args: {
    secret: v.string(),
    discordGuildIds: v.array(v.string()),
    cursor: v.optional(v.union(v.null(), v.string())),
  },
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    const pending = await ctx.runQuery(internal.liveNotifications.pending, {
      cursor: args.cursor,
    })
    if (!pending.deliveries.length)
      return { deliveries: [], continueCursor: pending.continueCursor }
    const jobs = await ctx.runMutation(internal.liveNotifications.claimBatch, {
      discordGuildIds: args.discordGuildIds,
      jobs: pending.deliveries.map((delivery) => ({
        deliveryId: delivery._id,
        claim: randomUUID(),
      })),
    })
    // Fresh provider authority is checked at begin, immediately before reserving a send.
    // A delayed claim is also checked there against its actual live stream session.
    return {
      deliveries: jobs,
      // Drain a full local batch before advancing past still-pending matches.
      continueCursor:
        jobs.length === 4 ? (args.cursor ?? null) : pending.continueCursor,
    }
  },
})

export const begin = action({
  returns: v.boolean(),
  args: {
    secret: v.string(),
    deliveryId: v.id("twitchLiveDeliveries"),
    claim: v.string(),
    configUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    const delivery = await ctx.runQuery(internal.liveNotifications.delivery, {
      deliveryId: args.deliveryId,
    })
    if (!delivery) return false
    const owner = await ctx.runQuery(internal.liveNotifications.owner, {
      guildId: delivery.guildId,
    })
    const source = await verifyOwnerTwitch(owner)
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
    const { secret: _secret, ...input } = args
    return ctx.runMutation(internal.liveNotifications.begin, {
      ...input,
      expectedOwnerEvidenceKey:
        owner.status === "linked" ? ownerEvidenceKey(owner) : "",
    })
  },
})

export const finish = action({
  returns: v.union(v.null(), v.boolean()),
  args: {
    secret: v.string(),
    deliveryId: v.id("twitchLiveDeliveries"),
    claim: v.string(),
    messageId: v.optional(v.string()),
    failure: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    const { secret: _secret, ...input } = args
    return ctx.runMutation(internal.liveNotifications.finish, input)
  },
})

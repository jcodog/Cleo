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
        subscription && Date.now() - subscription.checkedAt < 120000
          ? subscription.status
          : ("unavailable" as const),
    }
  },
})

export const update = action({
  returns: v.null(),
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
    await ctx.runMutation(internal.liveNotifications.save, {
      ...args,
      liveNotificationRoleId: roleId,
      ...(source.status === "ready"
        ? {
            expectedBroadcasterId: source.broadcasterId,
            expectedOwnerDiscordId: context.guild.ownerDiscordId,
          }
        : {}),
    })
    return null
  },
})

export const runtimeSources = internalAction({
  returns: v.object({ broadcasterIds: v.array(v.string()) }),
  args: {},
  handler: async (ctx) => {
    const configured = await ctx.runQuery(
      internal.liveNotifications.configured,
      {}
    )
    const ids = new Set<string>()
    for (const target of configured) {
      const source = await verifyOwnerTwitch(target.owner)
      // Preserve subscriptions on provider outage. Explicit unlink removes them.
      if (source.status === "unavailable")
        throw new Error("Owner Twitch authority is unavailable.")
      if (source.status === "ready") ids.add(source.broadcasterId)
    }
    return { broadcasterIds: [...ids] }
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

export const processEvent = internalAction({
  returns: v.null(),
  args: { eventId: v.id("twitchLiveEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.runQuery(internal.liveNotifications.event, args)
    if (!event || event.state !== "pending") return null
    const targets: Target[] = []
    let retry = false
    try {
      const configured = await ctx.runQuery(
        internal.liveNotifications.configured,
        {}
      )
      for (const target of configured) {
        if (target.owner.twitch.providerAccountId !== event.broadcasterId)
          continue
        const source = await verifyOwnerTwitch(target.owner)
        if (source.status === "unavailable") {
          retry = true
          continue
        }
        if (source.status !== "ready") continue
        let metadata: { title?: string; category?: string } = {}
        try {
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
          if (response.ok) {
            const value: unknown = await response.json()
            if (
              value &&
              typeof value === "object" &&
              "data" in value &&
              Array.isArray(value.data)
            ) {
              const stream: unknown = value.data.find(
                (entry: unknown) =>
                  entry &&
                  typeof entry === "object" &&
                  "id" in entry &&
                  entry.id === event.streamId
              )
              if (stream && typeof stream === "object")
                metadata = {
                  ...("title" in stream && typeof stream.title === "string"
                    ? { title: stream.title.slice(0, 500) }
                    : {}),
                  ...("game_name" in stream &&
                  typeof stream.game_name === "string"
                    ? { category: stream.game_name.slice(0, 100) }
                    : {}),
                }
            }
          }
        } catch {
          /* Metadata is optional. The verified live transition remains usable. */
        }
        targets.push({
          guildId: target.config.guildId,
          ownerDiscordId: target.owner.discord.providerAccountId,
          login: source.login,
          displayName: source.displayName,
          ...metadata,
        })
      }
    } catch {
      retry = true
    }
    await ctx.runMutation(internal.liveNotifications.dispatch, {
      eventId: event._id,
      targets,
      retry,
    })
    return null
  },
})

export const claim = action({
  returns: v.array(claimedLiveDelivery),
  args: { secret: v.string(), discordGuildIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)
    const pending = await ctx.runQuery(internal.liveNotifications.pending, {
      discordGuildIds: args.discordGuildIds,
    })
    for (const job of pending) {
      // The mutation cancels obsolete jobs before they can block newer sessions.
      const result = await ctx.runMutation(internal.liveNotifications.claim, {
        deliveryId: job.delivery._id,
        claim: randomUUID(),
      })
      if (!result) continue
      const owner = await ctx.runQuery(internal.liveNotifications.owner, {
        guildId: job.delivery.guildId,
      })
      const source = await verifyOwnerTwitch(owner)
      if (
        source.status !== "ready" ||
        source.broadcasterId !== job.delivery.broadcasterId
      ) {
        logger.warn(
          "Live delivery authority is unavailable; claim will expire",
          { deliveryId: result._id, sourceStatus: source.status }
        )
        return []
      }
      return [result]
    }
    return []
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
    )
      return false
    const { secret: _secret, ...input } = args
    return ctx.runMutation(internal.liveNotifications.begin, input)
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

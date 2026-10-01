import { ChannelType, PermissionFlagsBits, type Client } from "discord.js"
import type { FunctionReturnType } from "convex/server"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { convexBotClient } from "./convexBotClient"
import { buildTwitchLiveView } from "./twitchLiveView"
import { invalidateDiscordGuildRuntimeConfig } from "./guildRuntimeConfig"
import { registerCleanupHook } from "../runtime/shutdown"
import { botLogError } from "../utils/botLog"

type Delivery = FunctionReturnType<
  typeof api.liveNotificationActions.claim
>[number]
type DeliveryBackend = Pick<
  typeof convexBotClient,
  "claimLiveNotifications" | "beginLiveNotification" | "finishLiveNotification"
>

export async function deliverTwitchLiveNotification(
  client: Client,
  job: Delivery,
  backend: DeliveryBackend = convexBotClient
): Promise<void> {
  const outcome = { deliveryId: job._id, claim: job.claim }
  // Live delivery always uses the latest claim config, never a stale cache grant.
  invalidateDiscordGuildRuntimeConfig(job.discordGuildId)
  try {
    const guild = client.guilds.cache.get(job.discordGuildId)
    if (!guild || !job.config.liveNotificationChannelId)
      throw new Error("destinationUnavailable")
    if (guild.ownerId !== job.ownerDiscordId) throw new Error("ownerChanged")
    const channel = await guild.channels.fetch(
      job.config.liveNotificationChannelId
    )
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    )
      throw new Error("destinationUnavailable")
    const bot = guild.members.me ?? (await guild.members.fetchMe())
    const permissions = channel.permissionsFor(bot)
    if (
      !permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ])
    )
      throw new Error("missingDiscordPermission")
    if (
      job.config.liveNotificationMentionMode === "everyone" &&
      !permissions.has(PermissionFlagsBits.MentionEveryone)
    )
      throw new Error("missingMentionPermission")
    if (job.config.liveNotificationMentionMode === "role") {
      const role = job.config.liveNotificationRoleId
        ? await guild.roles.fetch(job.config.liveNotificationRoleId)
        : null
      if (
        !role ||
        role.id === guild.id ||
        role.managed ||
        (!role.mentionable &&
          !permissions.has(PermissionFlagsBits.MentionEveryone))
      )
        throw new Error("roleUnavailable")
    }
    const payload = buildTwitchLiveView({
      deliveryId: job._id,
      login: job.login,
      displayName: job.displayName,
      startedAt: job.startedAt,
      title: job.title,
      category: job.category,
      mentionMode: job.config.liveNotificationMentionMode,
      roleId: job.config.liveNotificationRoleId,
    })
    if (
      (await backend.beginLiveNotification({
        ...outcome,
        configUpdatedAt: job.config.updatedAt,
      })) !== true
    )
      return
    const message = await channel.send(payload)
    const recorded = await backend.finishLiveNotification({
      ...outcome,
      messageId: message.id,
    })
    if (recorded === null)
      botLogError(
        "Twitch live notification outcome could not be recorded.",
        undefined,
        { deliveryId: job._id, messageId: message.id }
      )
  } catch (error) {
    botLogError("Twitch live notification delivery failed.", error, {
      deliveryId: job._id,
      discordGuildId: job.discordGuildId,
    })
    await backend.finishLiveNotification({
      ...outcome,
      failure: "discordDeliveryFailed",
    })
  }
}

export function startTwitchLiveNotificationWorker(client: Client<true>): void {
  let running = false
  let stopped = false
  let offset = 0
  const tick = async () => {
    if (running || stopped || !client.isReady()) return
    running = true
    try {
      const guildIds = [...client.guilds.cache.keys()]
      const batch = guildIds.slice(offset, offset + 100)
      offset = offset + 100 >= guildIds.length ? 0 : offset + 100
      if (!batch.length) return
      // Claim immediately before delivery so queued jobs cannot exhaust their lease.
      for (let count = 0; count < 20 && !stopped; count++) {
        const deliveries = await convexBotClient.claimLiveNotifications(batch)
        if (!deliveries?.length) break
        for (const delivery of deliveries) {
          if (stopped) break
          await deliverTwitchLiveNotification(client, delivery)
        }
      }
    } catch (error) {
      botLogError("Twitch live notification worker failed.", error)
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => {
    void tick()
  }, 15000)
  timer.unref()
  registerCleanupHook(() => {
    stopped = true
    clearInterval(timer)
  })
  void tick()
}

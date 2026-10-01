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
>["deliveries"][number]
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
  let reserved = false
  let sentMessageId: string | undefined
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
    reserved = true
    const message = await channel.send(payload)
    sentMessageId = message.id
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
    if (sentMessageId) return // Preserve the known send; expiry must never replay it.
    const code = error instanceof Error ? error.message : ""
    const permanent = [
      "destinationUnavailable",
      "ownerChanged",
      "missingDiscordPermission",
      "missingMentionPermission",
      "roleUnavailable",
    ]
    if (!reserved && !permanent.includes(code)) return
    try {
      await backend.finishLiveNotification({
        ...outcome,
        failure: reserved ? "sendOutcomeUnknown" : code,
      })
    } catch (recordError) {
      botLogError(
        "Twitch live notification failure could not be recorded; claim expiry will settle it.",
        recordError,
        { deliveryId: job._id }
      )
    }
  }
}

const workers = new WeakSet<Client<true>>()

export function startTwitchLiveNotificationWorker(client: Client<true>): void {
  if (workers.has(client)) return
  workers.add(client)
  let running = false
  let stopped = false
  let cursor: string | null = null
  const tick = async () => {
    if (running || stopped || !client.isReady()) return
    running = true
    try {
      const guildIds = [...client.guilds.cache.keys()]
      if (!guildIds.length) return
      const page = await convexBotClient.claimLiveNotifications(
        guildIds,
        cursor
      )
      if (!page) return
      cursor = page.continueCursor
      let next = 0
      // Fixed worker pool keeps the 20-job claim batch inside its lease.
      await Promise.all(
        Array.from(
          { length: Math.min(4, page.deliveries.length) },
          async () => {
            while (!stopped && next < page.deliveries.length) {
              const delivery = page.deliveries[next++]!
              await deliverTwitchLiveNotification(client, delivery)
            }
          }
        )
      )
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
    workers.delete(client)
    clearInterval(timer)
  })
  void tick()
}

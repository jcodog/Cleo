import { randomUUID } from "node:crypto"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { discordEnv } from "@workspace/env/discord"
import { ModerationRuntime } from "@workspace/shared/moderationRuntime"
import { MODERATION_ROLLOUT_LOCKED } from "@workspace/shared/moderation"
import {
  GatewayIntentBits,
  PermissionFlagsBits,
  type Message,
} from "discord.js"
import { fetchDiscordGuildRuntimeConfig } from "./guildRuntimeConfig"
import { botLogError, botLog } from "@/utils/botLog"
import { registerCleanupHook } from "@/runtime/shutdown"

const worker = randomUUID()
const runtime = new ModerationRuntime(async (scopeId) => {
  if (!discordEnv.CONVEX_URL || !discordEnv.DISCORD_BOT_CONVEX_SECRET)
    return null
  const config = await fetchDiscordGuildRuntimeConfig(scopeId)
  if (config.status !== "ready" || !config.config.moderationEnabled) return null
  const client = new ConvexHttpClient(discordEnv.CONVEX_URL)
  return client.action(api.moderationActions.runtime, {
    secret: discordEnv.DISCORD_BOT_CONVEX_SECRET,
    platform: "discord",
    scopeId,
    worker,
    health: "Discord runtime connected; permissions checked per message",
  })
})
const refresh = setInterval(() => {
  void runtime.refresh(Math.floor(performance.now()))
}, 15000)
refresh.unref()
registerCleanupHook(() => clearInterval(refresh))

export async function moderateDiscordMessage(message: Message) {
  if (MODERATION_ROLLOUT_LOCKED) return
  if (
    !message.guild ||
    !message.member ||
    message.author.bot ||
    message.webhookId ||
    !discordEnv.DISCORD_MESSAGE_CONTENT_ENABLED
  )
    return
  if (
    discordEnv.DISCORD_MESSAGE_CONTENT_ENABLED !== "true" ||
    !message.client.options.intents.has(GatewayIntentBits.MessageContent)
  )
    return
  await runtime.load(message.guild.id, Math.floor(performance.now()))
  const result = runtime.inspect(
    {
      id: message.id,
      scopeId: message.guild.id,
      historyScopeId: message.channelId,
      authorId: message.author.id,
      content: message.content,
      roleIds: [...message.member.roles.cache.keys()],
      isAdministrator: message.member.permissions.has(
        PermissionFlagsBits.Administrator
      ),
      isModerator: message.member.permissions.has(
        PermissionFlagsBits.ModerateMembers
      ),
    },
    Math.floor(performance.now())
  )
  if (!result?.decision.matched) return
  botLog(
    `Message moderation matched rules: ${result.decision.ruleIds.join(", ")}.`,
    "info"
  )
  if (
    !result.enforce ||
    discordEnv.DISCORD_MODERATION_ENFORCEMENT_ENABLED !== "true"
  )
    return
  const action = result.decision.proposedAction
  const me = message.guild.members.me
  if (
    !me ||
    message.member.id === message.guild.ownerId ||
    message.member.roles.highest.position >= me.roles.highest.position
  )
    return
  try {
    if (
      action.kind === "none" ||
      action.kind === "log" ||
      !discordEnv.CONVEX_URL ||
      !discordEnv.DISCORD_BOT_CONVEX_SECRET
    )
      return
    const claimed = await new ConvexHttpClient(discordEnv.CONVEX_URL).action(
      api.moderationActions.claimDiscord,
      {
        secret: discordEnv.DISCORD_BOT_CONVEX_SECRET,
        scopeId: message.guild.id,
        worker,
        revision: result.decision.policyRevision,
        messageId: message.id,
      }
    )
    if (!claimed) return
    if (
      action.kind === "delete" &&
      message.deletable &&
      "permissionsFor" in message.channel &&
      message.channel
        .permissionsFor(me)
        ?.has(PermissionFlagsBits.ManageMessages)
    )
      await message.delete()
    if (
      action.kind === "warn" &&
      message.channel.isSendable() &&
      "permissionsFor" in message.channel &&
      message.channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)
    )
      await message.channel.send({
        content: `<@${message.author.id}> Please follow this community's chat rules.`,
        allowedMentions: { users: [message.author.id] },
      })
    if (
      action.kind === "timeout" &&
      message.member.moderatable &&
      me.permissions.has(PermissionFlagsBits.ModerateMembers)
    )
      await message.member.timeout(
        action.durationSeconds * 1000,
        "Configured Cleo moderation policy"
      )
  } catch {
    botLogError("Message moderation action unavailable.")
  }
}

"use node"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { backendEnv } from "@workspace/env/backend"
import { discordJson } from "./lib/communityDiscord"
import { digestIntegrationValue } from "./lib/integrationSecurity"
function config(delivery = true) {
  if (
    (delivery && backendEnv.CLEO_RECOGNITION_ENABLED !== "true") ||
    !backendEnv.DISCORD_BOT_TOKEN ||
    !backendEnv.CLEO_OFFICIAL_GUILD_ID ||
    !backendEnv.CLEO_COMMUNITY_UPGRADES_CHANNEL_ID
  )
    return null
  return {
    token: backendEnv.DISCORD_BOT_TOKEN,
    guildId: backendEnv.CLEO_OFFICIAL_GUILD_ID,
    channelId: backendEnv.CLEO_COMMUNITY_UPGRADES_CHANNEL_ID,
  }
}
export const deliver = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const settings = config()
    if (!settings) return null
    const channel = z
      .object({ guild_id: z.string() })
      .parse(
        await discordJson(
          `/channels/${settings.channelId}`,
          settings.token,
          {},
          true
        )
      )
    if (channel.guild_id !== settings.guildId)
      throw new Error(
        "Recognition channel must belong to Cleo's official server."
      )
    for (let index = 0; index < 5; index++) {
      const attempt = randomUUID()
      const job = await ctx.runMutation(internal.communityRecognition.claim, {
        attempt,
      })
      if (!job) break
      try {
        const name = job.name
          .normalize("NFC")
          .replace(/[\p{Cc}\p{Cf}@#*_`<>]/gu, " ")
          .slice(0, 100)
        const content =
          job.purchaserKind === "owner"
            ? `<@${job.discordUserId}> just upgraded their community, ${name}, to Cleo Premium!`
            : `<@${job.discordUserId}> just sponsored Cleo Premium for ${name}! Thank you for supporting their community.`
        const nonce = digestIntegrationValue(job.key).slice(0, 24)
        const sent = z.object({ id: z.string() }).parse(
          await discordJson(
            `/channels/${settings.channelId}/messages`,
            settings.token,
            {
              method: "POST",
              body: JSON.stringify({
                content,
                allowed_mentions: { parse: [], users: [job.discordUserId] },
                nonce,
                enforce_nonce: true,
                embeds: [{ footer: { text: `Cleo recognition ${nonce}` } }],
              }),
            },
            true
          )
        )
        await ctx.runMutation(internal.communityRecognition.settle, {
          id: job.id,
          attempt,
          messageId: sent.id,
        })
      } catch {
        await ctx.runMutation(internal.communityRecognition.settle, {
          id: job.id,
          attempt,
        })
      }
    }
    return null
  },
})
export const reconcile = internalAction({
  args: {
    investigationId: v.optional(v.id("communityAnnouncementOutbox")),
    messageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      Boolean(args.investigationId) !== Boolean(args.messageId) ||
      (args.messageId !== undefined && !/^\d{17,20}$/.test(args.messageId))
    )
      throw new Error(
        "An investigation and valid Discord message ID are required."
      )
    // Operator recovery verifies an existing message, even while delivery is disabled.
    const settings = config(!args.investigationId)
    if (!settings) return null
    const investigation = args.investigationId
      ? await ctx.runQuery(internal.communityRecognition.investigation, {
          id: args.investigationId,
        })
      : null
    const jobs = args.investigationId
      ? investigation
        ? [investigation]
        : []
      : await ctx.runQuery(internal.communityRecognition.uncertain, {})
    if (!jobs.length) return null
    const channel = z
      .object({ guild_id: z.string() })
      .parse(
        await discordJson(
          `/channels/${settings.channelId}`,
          settings.token,
          {},
          true
        )
      )
    if (channel.guild_id !== settings.guildId)
      throw new Error(
        "Recognition channel must belong to Cleo's official server."
      )
    const response = await discordJson(
      args.messageId
        ? `/channels/${settings.channelId}/messages/${args.messageId}`
        : `/channels/${settings.channelId}/messages?limit=100`,
      settings.token,
      {},
      true
    )
    const messages = z
      .array(
        z.object({
          id: z.string(),
          author: z.object({ id: z.string() }),
          embeds: z
            .array(
              z.object({ footer: z.object({ text: z.string() }).optional() })
            )
            .optional(),
        })
      )
      .max(100)
      .parse(args.messageId ? [response] : response)
    const me = z
      .object({ id: z.string(), bot: z.literal(true) })
      .parse(await discordJson("/users/@me", settings.token, {}, true))
    for (const job of jobs) {
      const footer = `Cleo recognition ${digestIntegrationValue(job.key).slice(0, 24)}`
      const sent = messages.find(
        (m) =>
          m.author.id === me.id &&
          (!args.messageId || m.id === args.messageId) &&
          m.embeds?.some((e) => e.footer?.text === footer)
      )
      if (args.investigationId && !sent)
        throw new Error("The investigation message could not be verified.")
      await ctx.runMutation(internal.communityRecognition.reconciled, {
        id: job._id,
        messageId: sent?.id,
      })
    }
    return null
  },
})

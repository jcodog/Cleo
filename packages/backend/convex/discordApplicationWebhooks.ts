"use node"
import { z } from "zod"
import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { backendEnv } from "@workspace/env/backend"
import {
  verifyDiscordApplicationWebhook,
  digestIntegrationValue,
} from "./lib/integrationSecurity"
const envelope = z.object({
  type: z.number(),
  application_id: z.string(),
  event: z
    .object({
      type: z.string(),
      timestamp: z.string(),
      data: z.object({
        integration_type: z.number().optional(),
        user: z.object({ id: z.string().regex(/^\d{17,20}$/) }),
      }),
    })
    .optional(),
})
export const receive = internalAction({
  args: { body: v.string(), signature: v.string(), timestamp: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (
      !backendEnv.DISCORD_APPLICATION_PUBLIC_KEY ||
      !verifyDiscordApplicationWebhook(
        args.body,
        args.signature,
        args.timestamp,
        backendEnv.DISCORD_APPLICATION_PUBLIC_KEY,
        Date.now()
      )
    )
      return false
    const event = envelope.parse(JSON.parse(args.body))
    if (event.application_id !== backendEnv.DISCORD_APPLICATION_ID) return false
    if (event.type === 0) return true
    if (!event.event) return false
    const evidenceAt = Date.parse(event.event.timestamp)
    if (!Number.isFinite(evidenceAt)) return false
    if (
      event.event.type === "APPLICATION_AUTHORIZED" &&
      event.event.data.integration_type === 0
    )
      return true
    if (
      event.event.type === "APPLICATION_AUTHORIZED" ||
      event.event.type === "APPLICATION_DEAUTHORIZED"
    )
      await ctx.runMutation(internal.discordConnections.installation, {
        discordUserId: event.event.data.user.id,
        state:
          event.event.type === "APPLICATION_AUTHORIZED" &&
          event.event.data.integration_type === 1
            ? "active"
            : "uncertain",
        evidenceAt,
        eventKey: digestIntegrationValue(args.body),
      })
    return true
  },
})

"use node"

import { v } from "convex/values"

import { internal } from "../../../../_generated/api"
import { action } from "../../../../_generated/server"
import {
  discordBotRuntimeErrorServiceArea,
  discordBotRuntimeErrorSeverity,
} from "../../../../dbTables/discordBotRuntimeErrors"
import { jsonValue } from "../../../../lib/validators"
import { assertValidBotSecret } from "../lib/auth"

export const report = action({
  args: {
    secret: v.string(),
    severity: discordBotRuntimeErrorSeverity,
    serviceArea: discordBotRuntimeErrorServiceArea,
    message: v.string(),
    stack: v.optional(v.string()),
    guildId: v.optional(v.id("guilds")),
    discordGuildId: v.optional(v.string()),
    commandName: v.optional(v.string()),
    eventName: v.optional(v.string()),
    operation: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    metadata: v.optional(jsonValue),
    occurredAt: v.optional(v.number()),
  },
  returns: v.object({
    id: v.id("discordBotRuntimeErrors"),
    deduplicated: v.boolean(),
    occurrenceCount: v.number(),
  }),
  handler: async (ctx, args) => {
    assertValidBotSecret(args.secret)

    return await ctx.runMutation(
      internal.mutations.bot.discord.runtimeErrors.record.record,
      {
        severity: args.severity,
        serviceArea: args.serviceArea,
        message: args.message,
        stack: args.stack,
        guildId: args.guildId,
        discordGuildId: args.discordGuildId,
        commandName: args.commandName,
        eventName: args.eventName,
        operation: args.operation,
        fingerprint: args.fingerprint,
        metadata: args.metadata,
        occurredAt: args.occurredAt,
      }
    )
  },
})
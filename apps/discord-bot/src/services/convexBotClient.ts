import { api } from "@workspace/backend/convex/_generated/api.js"
import { botLog, botLogError } from "@/utils/botLog"
import type {
  GuildLeftSnapshot,
  GuildSnapshot,
} from "@/utils/createGuildSnapshot"
import {
  guildLeftSnapshotSchema,
  guildSnapshotSchema,
} from "@/utils/createGuildSnapshot"
import { discordEnv } from "@workspace/env/discord"
import { ConvexHttpClient } from "convex/browser"
import { z } from "zod"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

const convexUrl = discordEnv.CONVEX_URL
const convexSecret = discordEnv.DISCORD_BOT_CONVEX_SECRET
const convexClients = new Map<string, ConvexHttpClient>()
const CONVEX_UDF_FAILED_STATUS = 560

const gatewayEventTimestampSchema = z
  .number()
  .refine(
    (value) => Number.isSafeInteger(value) && value >= 0,
    "Gateway event timestamp must be a non-negative safe integer."
  )

const gatewayShardIdSchema = z
  .number()
  .refine(
    (value) => Number.isSafeInteger(value) && value >= 0,
    "Gateway shard IDs must be non-negative safe integers."
  )

const gatewayShardScopeSchema = z
  .object({
    shardIds: z.array(gatewayShardIdSchema).min(1),
    shardCount: z
      .number()
      .refine(
        (value) => Number.isSafeInteger(value) && value > 0,
        "Gateway shard count must be a positive safe integer."
      ),
  })
  .superRefine((scope, ctx) => {
    const shardIds = new Set(scope.shardIds)

    if (shardIds.size !== scope.shardIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Gateway shard IDs must be unique.",
        path: ["shardIds"],
      })
    }

    for (const [index, shardId] of scope.shardIds.entries()) {
      if (shardId >= scope.shardCount) {
        ctx.addIssue({
          code: "custom",
          message: "Gateway shard ID must be less than shard count.",
          path: ["shardIds", index],
        })
      }
    }
  })

type GatewayShardScope = z.infer<typeof gatewayShardScopeSchema>

const discordSnowflakeSchema = z
  .string()
  .regex(/^\d{17,20}$/, "Discord IDs must be valid snowflakes.")

const discordGuildEventSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  eventType: z.enum([
    "guildMemberAdd",
    "guildMemberRemove",
    "guildBanAdd",
    "guildBanRemove",
    "channelCreate",
    "channelDelete",
    "roleCreate",
    "roleDelete",
    "messageDelete",
  ]),
  actorDiscordUserId: discordSnowflakeSchema.optional(),
  targetType: z.enum(["member", "user", "channel", "role", "message"]),
  targetDiscordId: discordSnowflakeSchema.optional(),
  targetDisplayName: z.string().optional(),
  channelId: discordSnowflakeSchema.optional(),
  roleId: discordSnowflakeSchema.optional(),
  reason: z.string().optional(),
  metadata: z.unknown().optional(),
  occurredAt: gatewayEventTimestampSchema,
  dedupeKey: z.string().optional(),
})

const discordModerationActionSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  actionType: z.enum(["ban", "kick"]),
  actorDiscordUserId: discordSnowflakeSchema,
  targetDiscordUserId: discordSnowflakeSchema,
  reason: z.string().optional(),
  result: z.enum(["success", "failed", "denied"]),
  failureCode: z.string().optional(),
  operationId: z.string(),
  metadata: z.unknown().optional(),
  occurredAt: gatewayEventTimestampSchema,
})

type ConvexBotRuntimeEnv = {
  convexUrl?: string
  convexSecret?: string
  nodeEnv?: string
}

type ConvexBotRuntimeConfig =
  | {
      status: "ready"
      convexUrl: string
      convexSecret: string
    }
  | {
      status: "disabled"
      missingConfig: string[]
    }
  | {
      status: "invalid"
      error: Error
    }

export type DiscordBotRuntimeErrorSeverity =
  | "info"
  | "warn"
  | "error"
  | "critical"

export type DiscordBotRuntimeErrorServiceArea =
  | "startup"
  | "gateway"
  | "command"
  | "configuration"
  | "permission"
  | "backend"
  | "transport"
  | "welcome"
  | "moderation"
  | "logging"
  | "unknown"

type ReportRuntimeErrorArgs = FunctionArgs<
  typeof api.actions.bot.discord.runtimeErrors.report.report
>
type RecordGuildEventArgs = FunctionArgs<
  typeof api.actions.bot.discord.guildEvents.record.record
>
type RecordModerationActionArgs = FunctionArgs<
  typeof api.actions.bot.discord.moderationActions.record.record
>
type OpenSupportTicketArgs = FunctionArgs<
  typeof api.actions.bot.discord.supportTickets.openOrResume.openOrResume
>

export type DiscordBotRuntimeErrorReportMetadata =
  ReportRuntimeErrorArgs["metadata"]

export type DiscordBotRuntimeErrorReportResult = FunctionReturnType<
  typeof api.actions.bot.discord.runtimeErrors.report.report
>
export type DiscordGuildEventRecord = RecordGuildEventArgs["event"]
export type DiscordGuildEventRecordResult = FunctionReturnType<
  typeof api.actions.bot.discord.guildEvents.record.record
>
export type DiscordModerationActionRecord = RecordModerationActionArgs["action"]
export type DiscordModerationActionRecordResult = FunctionReturnType<
  typeof api.actions.bot.discord.moderationActions.record.record
>
export type DiscordSupportTicketOpenInput = OpenSupportTicketArgs["input"]
export type DiscordSupportTicketOpenResult = FunctionReturnType<
  typeof api.actions.bot.discord.supportTickets.openOrResume.openOrResume
>

export type DiscordBotRuntimeErrorReport = {
  severity: DiscordBotRuntimeErrorSeverity
  serviceArea: DiscordBotRuntimeErrorServiceArea
  message: string
  stack?: string
  discordGuildId?: string
  commandName?: string
  eventName?: string
  operation?: string
  fingerprint?: string
  metadata?: DiscordBotRuntimeErrorReportMetadata
  occurredAt?: number
}

export class ConvexHttpRequestError extends Error {
  public override readonly name = "ConvexHttpRequestError"

  public constructor({
    method,
    status,
    statusText,
    url,
  }: {
    method: string
    status: number
    statusText: string
    url: string
  }) {
    const statusLabel = statusText ? `${status} ${statusText}` : String(status)

    super(
      `Convex HTTP request failed: ${method} ${url} returned ${statusLabel}.`
    )
  }
}

export function validateConvexUrl(
  value: string,
  nodeEnv = process.env.NODE_ENV
): string {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error("CONVEX_URL must be a valid URL.")
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("CONVEX_URL must not include credentials.")
  }

  if (
    parsedUrl.pathname.replaceAll("/", "") ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "CONVEX_URL must be an origin without a path, query, or hash."
    )
  }

  if (parsedUrl.protocol === "https:") {
    return parsedUrl.origin
  }

  if (
    parsedUrl.protocol === "http:" &&
    nodeEnv !== "production" &&
    isLoopbackHostname(parsedUrl.hostname)
  ) {
    return parsedUrl.origin
  }

  throw new Error(
    "CONVEX_URL must use https unless it is explicit loopback HTTP in development."
  )
}

export function resolveConvexBotRuntimeConfig({
  convexUrl,
  convexSecret,
  nodeEnv = process.env.NODE_ENV,
}: ConvexBotRuntimeEnv): ConvexBotRuntimeConfig {
  const configuredConvexUrl = convexUrl
  const configuredConvexSecret = convexSecret
  const missingConfig = [
    ...(configuredConvexUrl ? [] : ["CONVEX_URL"]),
    ...(configuredConvexSecret ? [] : ["DISCORD_BOT_CONVEX_SECRET"]),
  ]

  if (!configuredConvexUrl || !configuredConvexSecret) {
    return {
      status: "disabled",
      missingConfig,
    }
  }

  try {
    return {
      status: "ready",
      convexUrl: validateConvexUrl(configuredConvexUrl, nodeEnv),
      convexSecret: configuredConvexSecret,
    }
  } catch (error) {
    return {
      status: "invalid",
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

export function assertConvexBotRuntimeConfig(
  env: ConvexBotRuntimeEnv = {
    convexUrl,
    convexSecret,
    nodeEnv: process.env.NODE_ENV,
  }
): void {
  const config = resolveConvexBotRuntimeConfig(env)

  if (config.status === "ready") {
    return
  }

  if (config.status === "invalid") {
    throw config.error
  }

  if (env.nodeEnv === "production") {
    throw new Error(
      `Missing production Discord bot runtime config: ${config.missingConfig.join(
        ", "
      )}.`
    )
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  )
}

function getConvexClient(validatedConvexUrl: string): ConvexHttpClient {
  const existing = convexClients.get(validatedConvexUrl)

  if (existing) {
    return existing
  }

  const client = new ConvexHttpClient(validatedConvexUrl, {
    fetch: createConvexDiagnosticFetch(),
    logger: false,
  })

  convexClients.set(validatedConvexUrl, client)

  return client
}

export function createConvexDiagnosticFetch(
  fetchImplementation: typeof fetch = fetch
): typeof fetch {
  return async (input, init) => {
    const response = await fetchImplementation(input, init)

    if (response.ok || response.status === CONVEX_UDF_FAILED_STATUS) {
      return response
    }

    throw new ConvexHttpRequestError({
      method: getFetchMethod(input, init),
      status: response.status,
      statusText: response.statusText,
      url: response.url || getFetchUrl(input),
    })
  }
}

function getFetchMethod(
  input: RequestInfo | URL,
  init: RequestInit | undefined
) {
  if (init?.method) {
    return init.method.toUpperCase()
  }

  if (input instanceof Request) {
    return input.method.toUpperCase()
  }

  return "GET"
}

function getFetchUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url
  }

  return String(input)
}

function getConvexSyncConfig(operation: string) {
  const runtimeConfig = resolveConvexBotRuntimeConfig({
    convexUrl,
    convexSecret,
  })

  if (runtimeConfig.status === "disabled") {
    botLog(
      `Convex sync disabled, skipped ${operation}: missing ${runtimeConfig.missingConfig.join(
        ", "
      )}.`,
      "warn"
    )
    return null
  }

  if (runtimeConfig.status === "invalid") {
    botLogError(
      `Convex sync disabled, skipped ${operation}: invalid CONVEX_URL.`,
      runtimeConfig.error
    )
    return null
  }

  return {
    client: getConvexClient(runtimeConfig.convexUrl),
    secret: runtimeConfig.convexSecret,
  }
}

async function callWithConvex<T>(
  operation: string,
  callback: (config: { client: ConvexHttpClient; secret: string }) => Promise<T>
): Promise<T | null> {
  const config = getConvexSyncConfig(operation)

  if (!config) {
    return null
  }

  try {
    return await callback(config)
  } catch (error) {
    botLogError(`Convex ${operation} failed.`, error, {
      operation,
    })
    return null
  }
}

async function syncWithConvex(
  operation: string,
  callback: (config: {
    client: ConvexHttpClient
    secret: string
  }) => Promise<void>
): Promise<void> {
  await callWithConvex(operation, callback)
}

export const convexBotClient = {
  async syncReadyGuilds(
    guilds: GuildSnapshot[],
    options: {
      shardScope: GatewayShardScope
      syncedAt: number
    }
  ) {
    await syncWithConvex("ready guild sync", async ({ client, secret }) => {
      const parsedGuilds = z.array(guildSnapshotSchema).parse(guilds)
      const parsedSyncedAt = gatewayEventTimestampSchema.parse(options.syncedAt)
      const parsedShardScope = gatewayShardScopeSchema.parse(options.shardScope)

      await client.action(api.actions.bot.discord.gateway.syncReady.sync, {
        secret,
        guilds: parsedGuilds,
        shardScope: parsedShardScope,
        syncedAt: parsedSyncedAt,
      })

      botLog(`Synced ${parsedGuilds.length} ready guild(s) to Convex.`, "debug")
    })
  },

  async syncGuildJoined(guild: GuildSnapshot, syncedAt: number) {
    await syncWithConvex("guild join sync", async ({ client, secret }) => {
      const parsedGuild = guildSnapshotSchema.parse(guild)
      const parsedSyncedAt = gatewayEventTimestampSchema.parse(syncedAt)

      await client.action(api.actions.bot.discord.gateway.guildJoined.sync, {
        secret,
        guild: parsedGuild,
        syncedAt: parsedSyncedAt,
      })

      botLog(
        `Synced joined guild ${parsedGuild.discordGuildId} to Convex.`,
        "debug"
      )
    })
  },

  async syncGuildLeft(guild: GuildLeftSnapshot) {
    await syncWithConvex("guild leave sync", async ({ client, secret }) => {
      const parsedGuild = guildLeftSnapshotSchema.parse(guild)

      await client.action(api.actions.bot.discord.gateway.guildLeft.sync, {
        secret,
        guild: parsedGuild,
      })

      botLog(
        `Synced left guild ${parsedGuild.discordGuildId} to Convex.`,
        "debug"
      )
    })
  },

  async fetchGuildRuntimeConfig(
    discordGuildId: string
  ): Promise<unknown | null> {
    return await callWithConvex(
      "guild runtime config fetch",
      async ({ client, secret }) =>
        await client.action(
          api.actions.bot.discord.guildConfigs.getRuntimeConfig.fetch,
          {
            secret,
            discordGuildId,
          }
        )
    )
  },

  async openOrResumeSupportTicket(
    input: DiscordSupportTicketOpenInput
  ): Promise<DiscordSupportTicketOpenResult | null> {
    return await callWithConvex(
      "support ticket open",
      async ({ client, secret }) =>
        await client.action(
          api.actions.bot.discord.supportTickets.openOrResume.openOrResume,
          {
            secret,
            input: {
              requesterDiscordUserId: discordSnowflakeSchema.parse(
                input.requesterDiscordUserId
              ),
              ...(input.discordGuildId !== undefined
                ? {
                    discordGuildId: discordSnowflakeSchema.parse(
                      input.discordGuildId
                    ),
                  }
                : {}),
              ...(input.message !== undefined
                ? { message: input.message }
                : {}),
            },
          }
        )
    )
  },

  async reportRuntimeError(
    report: DiscordBotRuntimeErrorReport
  ): Promise<DiscordBotRuntimeErrorReportResult | null> {
    return await callWithConvex(
      "runtime error report",
      async ({ client, secret }) =>
        await client.action(
          api.actions.bot.discord.runtimeErrors.report.report,
          {
            secret,
            severity: report.severity,
            serviceArea: report.serviceArea,
            message: report.message,
            stack: report.stack,
            discordGuildId: report.discordGuildId,
            commandName: report.commandName,
            eventName: report.eventName,
            operation: report.operation,
            fingerprint: report.fingerprint,
            metadata: report.metadata,
            occurredAt: report.occurredAt,
          }
        )
    )
  },

  async recordGuildEvent(
    event: DiscordGuildEventRecord
  ): Promise<DiscordGuildEventRecordResult | null> {
    return await callWithConvex(
      "guild event record",
      async ({ client, secret }) => {
        const parsedEvent = discordGuildEventSchema.parse(
          event
        ) as DiscordGuildEventRecord

        const result = await client.action(
          api.actions.bot.discord.guildEvents.record.record,
          {
            secret,
            event: parsedEvent,
          }
        )

        botLog(
          `Recorded Discord guild event ${parsedEvent.eventType} for ${parsedEvent.discordGuildId}.`,
          "debug"
        )

        return result
      }
    )
  },

  async recordModerationAction(
    action: DiscordModerationActionRecord
  ): Promise<DiscordModerationActionRecordResult | null> {
    return await callWithConvex(
      "moderation action record",
      async ({ client, secret }) => {
        const parsedAction = discordModerationActionSchema.parse(
          action
        ) as DiscordModerationActionRecord

        const result = await client.action(
          api.actions.bot.discord.moderationActions.record.record,
          {
            secret,
            action: parsedAction,
          }
        )

        botLog(
          `Recorded Discord moderation action ${parsedAction.actionType} for ${parsedAction.discordGuildId}.`,
          "debug"
        )

        return result
      }
    )
  },
}

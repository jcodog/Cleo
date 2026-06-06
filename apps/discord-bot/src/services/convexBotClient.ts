import { api } from "@workspace/backend/convex/_generated/api.js"
import { botLog, botLogError } from "@workspace/discord-bot/utils/botLog"
import type {
  GuildLeftSnapshot,
  GuildSnapshot,
} from "@workspace/discord-bot/utils/createGuildSnapshot"
import {
  guildLeftSnapshotSchema,
  guildSnapshotSchema,
} from "@workspace/discord-bot/utils/createGuildSnapshot"
import { discordEnv } from "@workspace/env/discord"
import { ConvexHttpClient } from "convex/browser"
import { z } from "zod"

const convexUrl = discordEnv.CONVEX_URL
const convexSecret = discordEnv.DISCORD_BOT_CONVEX_SECRET

const gatewayEventTimestampSchema = z.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 0,
  "Gateway event timestamp must be a non-negative safe integer."
)

const gatewayShardIdSchema = z.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 0,
  "Gateway shard IDs must be non-negative safe integers."
)

const gatewayShardScopeSchema = z
  .object({
    shardIds: z.array(gatewayShardIdSchema).min(1),
    shardCount: z.number().refine(
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

const convex = convexUrl
  ? new ConvexHttpClient(convexUrl, {
      logger: false,
    })
  : null

function getMissingConvexConfig(): string[] {
  return [
    ...(convexUrl ? [] : ["CONVEX_URL"]),
    ...(convexSecret ? [] : ["DISCORD_BOT_CONVEX_SECRET"]),
  ]
}

function getConvexSyncConfig(operation: string) {
  const missingConfig = getMissingConvexConfig()

  if (missingConfig.length > 0 || !convex || !convexSecret) {
    botLog(
      `Convex sync disabled, skipped ${operation}: missing ${missingConfig.join(
        ", "
      )}.`,
      "warn"
    )
    return null
  }

  return {
    client: convex,
    secret: convexSecret,
  }
}

async function callWithConvex<T>(
  operation: string,
  callback: (config: {
    client: ConvexHttpClient
    secret: string
  }) => Promise<T>
): Promise<T | null> {
  const config = getConvexSyncConfig(operation)

  if (!config) {
    return null
  }

  try {
    return await callback(config)
  } catch (error) {
    botLogError(`Convex ${operation} failed.`, error)
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

      botLog(`Synced left guild ${parsedGuild.discordGuildId} to Convex.`, "debug")
    })
  },

  async fetchGuildRuntimeConfig(discordGuildId: string): Promise<unknown | null> {
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
}

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

async function syncWithConvex(
  operation: string,
  callback: (config: {
    client: ConvexHttpClient
    secret: string
  }) => Promise<void>
): Promise<void> {
  const config = getConvexSyncConfig(operation)

  if (!config) {
    return
  }

  try {
    await callback(config)
  } catch (error) {
    botLogError(`Convex ${operation} failed.`, error)
  }
}

export const convexBotClient = {
  async syncReadyGuilds(guilds: GuildSnapshot[]) {
    await syncWithConvex("ready guild sync", async ({ client, secret }) => {
      const parsedGuilds = z.array(guildSnapshotSchema).parse(guilds)

      await client.action(api.actions.bot.discord.gateway.syncReady.sync, {
        secret,
        guilds: parsedGuilds,
      })

      botLog(`Synced ${parsedGuilds.length} ready guild(s) to Convex.`, "debug")
    })
  },

  async syncGuildJoined(guild: GuildSnapshot) {
    await syncWithConvex("guild join sync", async ({ client, secret }) => {
      const parsedGuild = guildSnapshotSchema.parse(guild)

      await client.action(api.actions.bot.discord.gateway.guildJoined.sync, {
        secret,
        guild: parsedGuild,
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
}

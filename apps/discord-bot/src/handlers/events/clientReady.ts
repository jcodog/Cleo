import { Events, type Client } from "discord.js"

import { Event } from "@/classes/Event"
import { convexBotClient } from "@/services/convexBotClient"
import { configureRotatingStatus } from "@/services/rotatingStatus"
import { botLog, botLogError } from "@/utils/botLog"
import {
  createGuildSnapshot,
  type GuildSnapshot,
} from "@/utils/createGuildSnapshot"

type ReadySyncClient = Pick<typeof convexBotClient, "syncReadyGuilds">

type ClientReadyDependencies = {
  convexClient?: ReadySyncClient
  now?: () => number
  configureStatus?: typeof configureRotatingStatus
  log?: typeof botLog
  logError?: typeof botLogError
}

export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await handleClientReady(client)
  },
})

export async function handleClientReady(
  client: Client<true>,
  {
    convexClient = convexBotClient,
    now = Date.now,
    configureStatus = configureRotatingStatus,
    log = botLog,
    logError = botLogError,
  }: ClientReadyDependencies = {}
): Promise<void> {
  const syncedAt = now()
  const shardScope = getReadyShardScope(client)

  log(`Cleo is online as ${client.user.tag}`, "success")
  log(`Connected to ${client.guilds.cache.size} guild(s).`, "info")
  log(formatReadySyncScopeLog(shardScope), "info")
  configureStatus(client)

  const snapshots: GuildSnapshot[] = []

  for (const guild of client.guilds.cache.values()) {
    const snapshot = createGuildSnapshot(guild)
    snapshots.push(snapshot)

    log(
      `Guild available: ${snapshot.name} (${snapshot.discordGuildId}) with ${snapshot.memberCount} member(s).`,
      "info"
    )
  }

  try {
    await convexClient.syncReadyGuilds(snapshots, {
      shardScope,
      syncedAt,
    })
  } catch (error) {
    logError("Unexpected Convex ready guild sync failure.", error)
  }
}

export function getReadyShardScope(client: Client<true>) {
  return {
    shardIds: client.shard?.ids ?? [0],
    shardCount: client.shard?.count ?? 1,
  }
}

export function formatReadySyncScopeLog({
  shardCount,
  shardIds,
}: {
  shardIds: number[]
  shardCount: number
}): string {
  if (shardCount === 1 && shardIds.length === 1 && shardIds[0] === 0) {
    return "READY sync scope: single runtime."
  }

  return `READY sync shard scope: ids=${shardIds.join(",")}; count=${shardCount}.`
}

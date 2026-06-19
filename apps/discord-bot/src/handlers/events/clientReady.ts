import { Events, type Client } from "discord.js"

import { Event } from "@/classes/Event"
import { convexBotClient } from "@/services/convexBotClient"
import { botLog, botLogError } from "@/utils/botLog"
import {
  createGuildSnapshot,
  type GuildSnapshot,
} from "@/utils/createGuildSnapshot"

type ReadySyncClient = Pick<typeof convexBotClient, "syncReadyGuilds">

type ClientReadyDependencies = {
  convexClient?: ReadySyncClient
  now?: () => number
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
    log = botLog,
    logError = botLogError,
  }: ClientReadyDependencies = {}
): Promise<void> {
  const syncedAt = now()
  const shardScope = getReadyShardScope(client)

  log(`Cleo is online as ${client.user.tag}`, "success")
  log(`Connected to ${client.guilds.cache.size} guild(s).`, "info")

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

import { Events, type Client } from "discord.js"

import { Event } from "@/classes/Event"
import { convexBotClient } from "@/services/convexBotClient"
import { botLog, botLogError } from "@/utils/botLog"
import {
  createGuildSnapshot,
  type GuildSnapshot,
} from "@/utils/createGuildSnapshot"

export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const syncedAt = Date.now()
    const shardScope = getReadyShardScope(client)

    botLog(`Cleo is online as ${client.user.tag}`, "success")
    botLog(`Connected to ${client.guilds.cache.size} guild(s).`, "info")

    const snapshots: GuildSnapshot[] = []

    for (const guild of client.guilds.cache.values()) {
      const snapshot = createGuildSnapshot(guild)
      snapshots.push(snapshot)

      botLog(
        `Guild available: ${snapshot.name} (${snapshot.discordGuildId}) with ${snapshot.memberCount} member(s).`,
        "info"
      )
    }

    try {
      await convexBotClient.syncReadyGuilds(snapshots, {
        shardScope,
        syncedAt,
      })
    } catch (error) {
      botLogError("Unexpected Convex ready guild sync failure.", error)
    }
  },
})

function getReadyShardScope(client: Client<true>) {
  return {
    shardIds: client.shard?.ids ?? [0],
    shardCount: client.shard?.count ?? 1,
  }
}

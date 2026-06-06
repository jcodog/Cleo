import { Events } from "discord.js"

import { Event } from "@workspace/discord-bot/classes/Event"
import { convexBotClient } from "@workspace/discord-bot/services/convexBotClient"
import { botLog, botLogError } from "@workspace/discord-bot/utils/botLog"
import {
  createGuildSnapshot,
  type GuildSnapshot,
} from "@workspace/discord-bot/utils/createGuildSnapshot"

export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(client) {
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
      await convexBotClient.syncReadyGuilds(snapshots)
    } catch (error) {
      botLogError("Unexpected Convex ready guild sync failure.", error)
    }
  },
})

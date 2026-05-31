import { Events } from "discord.js"

import { Event } from "@workspace/discord-bot/classes/Event"
import { botLog } from "@workspace/discord-bot/utils/botLog"
import { createGuildSnapshot } from "@workspace/discord-bot/utils/createGuildSnapshot"

export default new Event({
  name: Events.ClientReady,
  once: true,
  execute(client) {
    botLog(`Cleo is online as ${client.user.tag}`, "success")
    botLog(`Connected to ${client.guilds.cache.size} guild(s).`, "info")

    for (const guild of client.guilds.cache.values()) {
      const snapshot = createGuildSnapshot(guild)

      botLog(
        `Guild available: ${snapshot.name} (${snapshot.id}) with ${snapshot.memberCount} member(s).`,
        "info"
      )
    }
  },
})

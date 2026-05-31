import { Events } from "discord.js"

import { Event } from "@workspace/discord-bot/classes/Event"
import { botLog } from "@workspace/discord-bot/utils/botLog"

export default new Event({
  name: Events.ClientReady,
  once: true,
  execute(client) {
    botLog(`Cleo Discord bot is online as ${client.user.tag}`, "success")
  },
})

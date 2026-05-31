import { Event } from "@workspace/discord-bot/classes/Event"
import { botLog } from "@workspace/discord-bot/utils/botLog"
import { Events, type Guild } from "discord.js"

export default new Event({
  name: Events.GuildDelete,

  async execute(guild: Guild) {
    botLog(`Left guild: ${guild.name} (${guild.id}).`, "warn")
  },
})

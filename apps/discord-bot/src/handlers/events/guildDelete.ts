import { Event } from "@workspace/discord-bot/classes/Event"
import { convexBotClient } from "@workspace/discord-bot/services/convexBotClient"
import { botLog, botLogError } from "@workspace/discord-bot/utils/botLog"
import { createGuildLeftSnapshot } from "@workspace/discord-bot/utils/createGuildSnapshot"
import { Events, type Guild } from "discord.js"

export default new Event({
  name: Events.GuildDelete,

  async execute(guild: Guild) {
    botLog(`Left guild: ${guild.name} (${guild.id}).`, "warn")

    try {
      await convexBotClient.syncGuildLeft(createGuildLeftSnapshot(guild))
    } catch (error) {
      botLogError("Unexpected Convex guild leave sync failure.", error)
    }
  },
})

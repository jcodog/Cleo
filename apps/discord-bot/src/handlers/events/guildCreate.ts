import { Event } from "@workspace/discord-bot/classes/Event"
import { convexBotClient } from "@workspace/discord-bot/services/convexBotClient"
import { botLog, botLogError } from "@workspace/discord-bot/utils/botLog"
import { createGuildSnapshot } from "@workspace/discord-bot/utils/createGuildSnapshot"
import { Events, type Guild } from "discord.js"

export default new Event({
  name: Events.GuildCreate,
  async execute(guild: Guild) {
    const snapshot = createGuildSnapshot(guild)

    botLog(
      `Joined guild: ${snapshot.name} (${snapshot.discordGuildId}) with ${snapshot.memberCount} member(s).`,
      "success"
    )

    try {
      await convexBotClient.syncGuildJoined(snapshot)
    } catch (error) {
      botLogError("Unexpected Convex guild join sync failure.", error)
    }
  },
})

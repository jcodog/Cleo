import { Event } from "@/classes/Event"
import { convexBotClient } from "@/services/convexBotClient"
import { botLog, botLogError } from "@/utils/botLog"
import { createGuildSnapshot } from "@/utils/createGuildSnapshot"
import { Events, type Guild } from "discord.js"

export default new Event({
  name: Events.GuildCreate,
  async execute(guild: Guild) {
    const syncedAt = Date.now()
    const snapshot = createGuildSnapshot(guild)

    botLog(
      `Joined guild: ${snapshot.name} (${snapshot.discordGuildId}) with ${snapshot.memberCount} member(s).`,
      "success"
    )

    try {
      await convexBotClient.syncGuildJoined(snapshot, syncedAt)
    } catch (error) {
      botLogError("Unexpected Convex guild join sync failure.", error)
    }
  },
})

import { Event } from "@workspace/discord-bot/classes/Event"
import { botLog } from "@workspace/discord-bot/utils/botLog"
import { createGuildSnapshot } from "@workspace/discord-bot/utils/createGuildSnapshot"
import { Events, type Guild } from "discord.js"

export default new Event({
  name: Events.GuildCreate,
  async execute(guild: Guild) {
    const snapshot = createGuildSnapshot(guild)

    botLog(
      `Joined guild: ${snapshot.name} (${snapshot.id}) with ${snapshot.memberCount} member(s).`,
      "success"
    )
  },
})

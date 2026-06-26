import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeGuildBanAdd,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.GuildBanAdd,
  async execute(ban) {
    await handleDiscordGuildEvent(normalizeGuildBanAdd(ban), {
      guild: ban.guild,
    })
  },
})

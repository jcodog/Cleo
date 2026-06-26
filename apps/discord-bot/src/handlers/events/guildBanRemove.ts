import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeGuildBanRemove,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.GuildBanRemove,
  async execute(ban) {
    await handleDiscordGuildEvent(normalizeGuildBanRemove(ban), {
      guild: ban.guild,
    })
  },
})

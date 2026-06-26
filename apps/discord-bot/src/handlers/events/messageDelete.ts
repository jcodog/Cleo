import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeMessageDelete,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.MessageDelete,
  async execute(message) {
    const event = normalizeMessageDelete(message)

    if (!event) {
      return
    }

    await handleDiscordGuildEvent(event, {
      guild: message.guild,
    })
  },
})

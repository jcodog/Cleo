import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeChannelDelete,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!("guild" in channel)) {
      return
    }

    await handleDiscordGuildEvent(normalizeChannelDelete(channel), {
      guild: channel.guild,
    })
  },
})

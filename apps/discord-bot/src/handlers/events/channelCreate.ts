import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeChannelCreate,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.ChannelCreate,
  async execute(channel) {
    await handleDiscordGuildEvent(normalizeChannelCreate(channel), {
      guild: channel.guild,
    })
  },
})

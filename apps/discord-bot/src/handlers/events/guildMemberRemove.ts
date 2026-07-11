import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeGuildMemberRemove,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.GuildMemberRemove,
  async execute(member) {
    await handleDiscordGuildEvent(normalizeGuildMemberRemove(member), {
      guild: member.guild,
    })
  },
})

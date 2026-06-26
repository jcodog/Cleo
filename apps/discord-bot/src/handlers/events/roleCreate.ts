import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeRoleCreate,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.GuildRoleCreate,
  async execute(role) {
    await handleDiscordGuildEvent(normalizeRoleCreate(role), {
      guild: role.guild,
    })
  },
})

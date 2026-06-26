import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeRoleDelete,
} from "@/services/guildEventLogging"

export default new Event({
  name: Events.GuildRoleDelete,
  async execute(role) {
    await handleDiscordGuildEvent(normalizeRoleDelete(role), {
      guild: role.guild,
    })
  },
})

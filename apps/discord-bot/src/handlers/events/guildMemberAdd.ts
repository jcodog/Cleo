import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import { handleGuildMemberWelcome } from "@/services/welcomeMessages"

export default new Event({
  name: Events.GuildMemberAdd,
  async execute(member) {
    await handleGuildMemberWelcome(member)
  },
})

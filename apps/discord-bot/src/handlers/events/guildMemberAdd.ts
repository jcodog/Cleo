import { Events } from "discord.js"

import { Event } from "@/classes/Event"
import {
  handleDiscordGuildEvent,
  normalizeGuildMemberAdd,
} from "@/services/guildEventLogging"
import { handleGuildMemberWelcome } from "@/services/welcomeMessages"
import { enqueueCommunityMember } from "@/services/communityRoleSync"

export default new Event({
  name: Events.GuildMemberAdd,
  async execute(member) {
    await handleDiscordGuildEvent(normalizeGuildMemberAdd(member), {
      guild: member.guild,
    })
    await handleGuildMemberWelcome(member)
    await enqueueCommunityMember(member.guild.id, member.id)
  },
})

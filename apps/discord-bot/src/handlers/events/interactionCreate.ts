import { Events, MessageFlags } from "discord.js"

import type { BotClient } from "@/classes/Client"
import { Event } from "../../classes/Event"
import { replyWithCommandError } from "@/utils/replyWithCommandError"

export default new Event({
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return
    }

    const client = interaction.client as BotClient
    const command = client.commands.get(interaction.commandName)

    if (!command) {
      await interaction.reply({
        content: "That command is not currently available.",
        flags: MessageFlags.Ephemeral,
      })

      return
    }

    try {
      await command.execute({ interaction })
    } catch (error) {
      await replyWithCommandError({
        interaction,
        error,
      })
    }
  },
})

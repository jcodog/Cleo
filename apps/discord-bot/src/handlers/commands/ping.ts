import { MessageFlags } from "discord.js"

import { Command } from "@workspace/discord-bot/classes/Command"

export default new Command({
  data: {
    name: "ping",
    description: "Check whether Cleo is responding",
  },
  async execute({ interaction }) {
    const latency = Date.now() - interaction.createdTimestamp

    await interaction.reply({
      content: `Pong! Cleo is online. Interaction latency: ${latency}ms`,
      flags: MessageFlags.Ephemeral,
    })
  },
})

import { Command } from "@workspace/discord-bot/classes/Command"
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
} from "discord.js"

export default new Command({
  data: {
    name: "help",
    description: "View Cleo's available commands.",
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ],
  },
  async execute({ interaction }) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: [
        "**Cleo command help**",
        "",
        "`/ping` - Check Cleo's Discord connection latency.",
        "`/help` - View this guide.",
        "`/profile` - View your Discord profile details known to Cleo.",
        "",
        "More server management tools are coming as the dashboad migration continues.",
      ].join("\n"),
    })
  },
})

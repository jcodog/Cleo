import { Command } from "@/classes/Command"
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
} from "discord.js"

export default new Command({
  data: {
    name: "profile",
    description: "View your Discord profile details known to Cleo.",
    integration_types: [ApplicationIntegrationType.UserInstall],
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
  },
  async execute({ interaction }) {
    const user = interaction.user
    const guild = interaction.guild

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: [
        "**Your Cleo profile**",
        "",
        `Discord user: ${user.toString()}`,
        `User ID: \`${user.id}\``,
        `Username: \`${user.username}\``,
        `Display name: \`${user.displayName}\``,
        guild ? `Server: \`${guild.name}\`` : "Server: `Direct interaction`",
        "",
        "Dashboard-linked profile data will appear here once the backend bridge is connected.",
      ].join("\n"),
    })
  },
})

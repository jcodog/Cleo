import { Command } from "@/classes/Command"
import { handleModerationCommand } from "@/services/moderationActions"
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
} from "discord.js"

export default new Command({
  data: {
    name: "kick",
    description: "Kick a server member.",
    default_member_permissions: PermissionFlagsBits.KickMembers.toString(),
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    options: [
      {
        name: "user",
        description: "The server member to kick.",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: "reason",
        description: "Optional audit log reason.",
        type: ApplicationCommandOptionType.String,
        max_length: 512,
        required: false,
      },
    ],
  },
  async execute({ interaction }) {
    await handleModerationCommand(interaction, "kick")
  },
})

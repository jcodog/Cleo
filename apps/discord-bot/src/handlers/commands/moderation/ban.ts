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
    name: "ban",
    description: "Ban a server member.",
    default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    options: [
      {
        name: "user",
        description: "The server member to ban.",
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
    await handleModerationCommand(interaction, "ban")
  },
})

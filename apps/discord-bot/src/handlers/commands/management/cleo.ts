import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
} from "discord.js"

import { Command } from "@/classes/Command"
import { handleCleoCommand } from "@/services/cleoCommand"

export default new Command({
  data: {
    name: "cleo",
    description: "Inspect and manage Cleo for this server",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "status",
        description: "Check Cleo's configured services for this server",
      },
    ],
  },
  async execute({ interaction }) {
    await handleCleoCommand(interaction)
  },
})

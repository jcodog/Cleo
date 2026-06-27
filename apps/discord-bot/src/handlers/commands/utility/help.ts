import { Command } from "@/classes/Command"
import { handleHelpCommand } from "@/services/supportTickets"
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js"

export default new Command({
  data: {
    name: "help",
    description: "Open or resume a private Cleo support request.",
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ],
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "message",
        description: "What do you need help with?",
        required: false,
        max_length: 1_000,
      },
    ],
  },
  async execute({ interaction }) {
    await handleHelpCommand(interaction)
  },
})

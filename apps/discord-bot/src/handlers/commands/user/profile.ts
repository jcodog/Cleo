import { Command } from "@/classes/Command"
import { handleProfileCommand } from "@/services/profileLookup"
import {
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js"

export default new Command({
  data: {
    name: "profile",
    description: "View your profile details known to Cleo.",
    integration_types: [ApplicationIntegrationType.UserInstall],
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
  },
  async execute({ interaction }) {
    await handleProfileCommand(interaction)
  },
})

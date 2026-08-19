import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
  type ChatInputCommandInteraction,
} from "discord.js"

import { Command } from "@/classes/Command"
import { handleEightBallCommand } from "@/services/eightBall"

type EightBallCommandHandler = (
  interaction: ChatInputCommandInteraction
) => Promise<void>

type EightBallCommandOptions = {
  handleCommand?: EightBallCommandHandler
}

export function createEightBallCommand({
  handleCommand = handleEightBallCommand,
}: EightBallCommandOptions = {}): Command {
  return new Command({
    data: {
      name: "8ball",
      description: "Ask Cleo a question and let fate decide.",
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
          name: "question",
          description: "What do you want to ask Cleo?",
          required: true,
          max_length: 500,
        },
      ],
    },

    async execute({ interaction }) {
      await handleCommand(interaction)
    },
  })
}

export default createEightBallCommand()

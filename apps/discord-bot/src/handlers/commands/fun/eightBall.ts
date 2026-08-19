import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js"

import { Command } from "@/classes/Command"

export const eightBallResponses = [
  "Absolutely.",
  "Without a doubt.",
  "Yeah, I'd bet on it.",
  "Signs point to yes.",
  "Looking very likely.",
  "I'd say yes.",

  "Ask me again in a minute.",
  "It's a little fuzzy.",
  "Could go either way.",
  "Not enough information. Suspicious.",
  "Maybe. That's all you're getting from me.",
  "I wouldn't make any irreversible decisions yet.",

  "Absolutely not.",
  "Don't count on it.",
  "That's looking like a no.",
  "Very doubtful.",
  "I wouldn't risk it.",
  "Nope.",
] as const

export function pickEightBallResponse(random = Math.random): string {
  const index = Math.floor(random() * eightBallResponses.length)

  return eightBallResponses[index] ?? eightBallResponses[0]
}

export default new Command({
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
    const question = interaction.options.getString("question", true)
    const answer = pickEightBallResponse()

    await interaction.reply({
      content: [`🎱 **${question}**`, "", `**Cleo says:** ${answer}`].join(
        "\n"
      ),
    })
  },
})

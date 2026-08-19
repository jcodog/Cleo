import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from "discord.js"

import { renderEightBallImage } from "@/services/eightBallImage"
import { buildEightBallView } from "@/services/eightBallView"

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

type EightBallDependencies = {
  random?: () => number
  renderImage?: (answer: string) => Buffer
  buildView?: (options: {
    question: string
    answer: string
    image: Buffer
    username: string
  }) => InteractionReplyOptions
}

export function pickEightBallResponse(random = Math.random): string {
  const index = Math.floor(random() * eightBallResponses.length)

  return eightBallResponses[index] ?? eightBallResponses[0]
}

export async function handleEightBallCommand(
  interaction: ChatInputCommandInteraction,
  {
    random = Math.random,
    renderImage = renderEightBallImage,
    buildView = buildEightBallView,
  }: EightBallDependencies = {}
): Promise<void> {
  const question = interaction.options.getString("question", true)
  const answer = pickEightBallResponse(random)

  const image = renderImage(answer)

  const reply = buildView({
    question,
    answer,
    image,
    username: interaction.user.displayName,
  })

  await interaction.reply(reply)
}

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js"

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
  renderImage?: typeof renderEightBallImage
  buildView?: typeof buildEightBallView
}

export function pickEightBallResponse(random = Math.random): string {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Eight ball random value must be between 0 and 1.")
  }

  const response =
    eightBallResponses[Math.floor(value * eightBallResponses.length)]
  if (response === undefined) {
    throw new RangeError("Eight ball response index is out of range.")
  }
  return response
}

export async function handleEightBallCommand(
  interaction: ChatInputCommandInteraction,
  {
    random = Math.random,
    renderImage = renderEightBallImage,
    buildView = buildEightBallView,
  }: EightBallDependencies = {}
): Promise<void> {
  const question = interaction.options.getString("question", true).trim()
  if (question.length === 0 || [...question].length > 500) {
    await interaction.reply({
      content: "Ask a question between 1 and 500 characters long.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    })
    return
  }

  await interaction.deferReply()
  const answer = pickEightBallResponse(random)

  const image = await renderImage(answer)

  const reply = buildView({
    question,
    answer,
    image,
    username: interaction.user.displayName,
  })

  await interaction.editReply(reply)
}

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
  type ChatInputCommandInteraction,
} from "discord.js"

import { createEightBallCommand } from "./eightBall"

test("/8ball exposes the expected command metadata", () => {
  const command = createEightBallCommand()

  assert.equal(command.data.name, "8ball")
  assert.equal(
    command.data.description,
    "Ask Cleo a question and let fate decide."
  )

  assert.deepEqual(command.data.integration_types, [
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  ])

  assert.deepEqual(command.data.contexts, [
    InteractionContextType.BotDM,
    InteractionContextType.Guild,
    InteractionContextType.PrivateChannel,
  ])

  assert.deepEqual(command.data.options, [
    {
      type: ApplicationCommandOptionType.String,
      name: "question",
      description: "What do you want to ask Cleo?",
      required: true,
      max_length: 500,
    },
  ])
})

test("/8ball delegates execution to the eight ball service", async () => {
  const handledInteractions: ChatInputCommandInteraction[] = []

  const command = createEightBallCommand({
    async handleCommand(interaction) {
      handledInteractions.push(interaction)
    },
  })

  const interaction = {
    commandName: "8ball",
  } as ChatInputCommandInteraction

  await command.execute({ interaction })

  assert.deepEqual(handledInteractions, [interaction])
})

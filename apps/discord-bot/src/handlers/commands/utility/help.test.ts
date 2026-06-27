import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js"

import help from "./help"

test("/help metadata is a contextual support entrypoint", () => {
  assert.equal(help.data.name, "help")
  assert.match(help.data.description, /support request/i)
  assert.deepEqual(help.data.integration_types, [
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  ])
  assert.deepEqual(help.data.contexts, [
    InteractionContextType.BotDM,
    InteractionContextType.Guild,
    InteractionContextType.PrivateChannel,
  ])
  assert.deepEqual(help.data.options, [
    {
      type: ApplicationCommandOptionType.String,
      name: "message",
      description: "What do you need help with?",
      required: false,
      max_length: 1_000,
    },
  ])
})

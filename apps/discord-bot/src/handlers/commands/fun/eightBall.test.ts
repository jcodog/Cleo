import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js"

import eightBall, {
  eightBallResponses,
  pickEightBallResponse,
} from "./eightBall"

test("/8ball exposes the expected command metadata", () => {
  assert.equal(eightBall.data.name, "8ball")
  assert.equal(
    eightBall.data.description,
    "Ask Cleo a question and let fate decide."
  )

  assert.deepEqual(eightBall.data.integration_types, [
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  ])

  assert.deepEqual(eightBall.data.contexts, [
    InteractionContextType.BotDM,
    InteractionContextType.Guild,
    InteractionContextType.PrivateChannel,
  ])

  assert.deepEqual(eightBall.data.options, [
    {
      type: ApplicationCommandOptionType.String,
      name: "question",
      description: "What do you want to ask Cleo?",
      required: true,
      max_length: 500,
    },
  ])
})

test("pickEightBallResponse selects from the response pool", () => {
  assert.equal(
    pickEightBallResponse(() => 0),
    eightBallResponses[0]
  )

  assert.equal(
    pickEightBallResponse(() => 0.999999),
    eightBallResponses[eightBallResponses.length - 1]
  )
})

test("/8ball replies with the question and a valid answer", async () => {
  const replies: unknown[] = []

  const interaction = {
    options: {
      getString(name: string, required: boolean) {
        assert.equal(name, "question")
        assert.equal(required, true)

        return "Will Cleo take over the world?"
      },
    },

    async reply(message: unknown) {
      replies.push(message)
    },
  }

  await eightBall.execute({
    interaction: interaction as never,
  })

  assert.equal(replies.length, 1)

  const reply = replies[0] as {
    content: string
  }

  assert.match(reply.content, /Will Cleo take over the world\?/)

  assert.ok(
    eightBallResponses.some((response) => reply.content.includes(response))
  )
})

import assert from "node:assert/strict"
import { test } from "node:test"

import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from "discord.js"

import {
  eightBallResponses,
  handleEightBallCommand,
  pickEightBallResponse,
} from "./eightBall"

test("pickEightBallResponse selects the first response", () => {
  assert.equal(
    pickEightBallResponse(() => 0),
    eightBallResponses[0]
  )
})

test("pickEightBallResponse selects the final response", () => {
  assert.equal(
    pickEightBallResponse(() => 0.999999),
    eightBallResponses[eightBallResponses.length - 1]
  )
})

test("handleEightBallCommand builds and sends an eight ball response", async () => {
  const renderedAnswers: string[] = []
  const builtViews: unknown[] = []
  const replies: InteractionReplyOptions[] = []

  const image = Buffer.from("eight-ball-image")

  const expectedReply: InteractionReplyOptions = {
    components: [],
  }

  const interaction = {
    options: {
      getString(name: string, required: boolean) {
        assert.equal(name, "question")
        assert.equal(required, true)

        return "Will Cleo take over the world?"
      },
    },

    user: {
      displayName: "Jason",
    },

    async reply(reply: InteractionReplyOptions) {
      replies.push(reply)
    },
  } as unknown as ChatInputCommandInteraction

  await handleEightBallCommand(interaction, {
    random: () => 0,

    renderImage(answer) {
      renderedAnswers.push(answer)
      return image
    },

    buildView(options) {
      builtViews.push(options)
      return expectedReply
    },
  })

  assert.deepEqual(renderedAnswers, [eightBallResponses[0]])

  assert.deepEqual(builtViews, [
    {
      question: "Will Cleo take over the world?",
      answer: eightBallResponses[0],
      image,
      username: "Jason",
    },
  ])

  assert.deepEqual(replies, [expectedReply])
})

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from "discord.js"

import { BotClient } from "@/classes/Client"
import { createEightBallCommand } from "@/handlers/commands/fun/eightBall"
import interactionCreate from "@/handlers/events/interactionCreate"
import type { DiscordRuntimeErrorReportInput } from "@/services/runtimeErrorReporter"

import {
  eightBallResponses,
  handleEightBallCommand,
  pickEightBallResponse,
} from "./eightBall"

function createInteraction(question = "Will this work?") {
  const calls: string[] = []
  const replies: InteractionReplyOptions[] = []
  const edits: InteractionEditReplyOptions[] = []
  const reports: DiscordRuntimeErrorReportInput[] = []
  const client = new BotClient(undefined, {
    async reportRuntimeError(report) {
      reports.push(report)
      return null
    },
  })
  const double = {
    client,
    id: "111111111111111111",
    commandName: "8ball",
    guildId: null,
    channelId: "222222222222222222",
    user: { displayName: "Jason" },
    options: {
      getString(name: string, required: boolean) {
        assert.equal(name, "question")
        assert.equal(required, true)
        return question
      },
    },
    deferred: false,
    replied: false,
    isChatInputCommand: () => true,
    async deferReply() {
      calls.push("defer")
      double.deferred = true
    },
    async reply(reply: InteractionReplyOptions) {
      calls.push("reply")
      replies.push(reply)
      double.replied = true
    },
    async editReply(reply: InteractionEditReplyOptions) {
      calls.push("edit")
      edits.push(reply)
      double.replied = true
    },
  }
  return {
    double,
    interaction: double as unknown as ChatInputCommandInteraction,
    calls,
    replies,
    edits,
    reports,
  }
}

test("response selection reaches every answer and both interval boundaries", () => {
  assert.equal(
    pickEightBallResponse(() => 0),
    eightBallResponses[0]
  )
  assert.equal(
    pickEightBallResponse(() => 1 - Number.EPSILON),
    eightBallResponses.at(-1)
  )
  for (const [index, response] of eightBallResponses.entries()) {
    assert.equal(
      pickEightBallResponse(() => (index + 0.5) / eightBallResponses.length),
      response
    )
  }
  const randomResponse = pickEightBallResponse()
  assert.ok(eightBallResponses.some((answer) => answer === randomResponse))
})

test("response selection rejects invalid random values without a fake answer", () => {
  for (const value of [-1, 1, 2, NaN, Infinity, -Infinity]) {
    assert.throws(() => pickEightBallResponse(() => value), RangeError)
  }
})

test("/8ball acknowledges before rendering and edits the deferred reply once", async () => {
  const fixture = createInteraction("  Will Cleo take over the world?  ")
  const image = Buffer.from("eight-ball-image")
  const expectedReply: InteractionEditReplyOptions = { components: [] }

  await handleEightBallCommand(fixture.interaction, {
    random: () => 0,
    async renderImage(answer) {
      fixture.calls.push("render")
      assert.equal(fixture.double.deferred, true)
      assert.equal(answer, eightBallResponses[0])
      return image
    },
    buildView(options) {
      fixture.calls.push("view")
      assert.deepEqual(options, {
        question: "Will Cleo take over the world?",
        answer: eightBallResponses[0],
        image,
        username: "Jason",
      })
      return expectedReply
    },
  })

  assert.deepEqual(fixture.calls, ["defer", "render", "view", "edit"])
  assert.deepEqual(fixture.replies, [])
  assert.deepEqual(fixture.edits, [expectedReply])
})

test("questions within 500 Unicode code points accept astral characters", async () => {
  for (const question of [
    "🎱".repeat(300),
    "🎱".repeat(500),
    `${"x".repeat(499)}🎱`,
  ]) {
    const fixture = createInteraction(question)
    await handleEightBallCommand(fixture.interaction, {
      random: () => 0,
      async renderImage() {
        return Buffer.from("image")
      },
      buildView(options) {
        assert.equal(options.question, question)
        return { components: [] }
      },
    })
    assert.deepEqual(fixture.calls, ["defer", "edit"])
    assert.deepEqual(fixture.replies, [])
    assert.equal(fixture.edits.length, 1)
  }
})

test("invalid questions reply privately before rendering", async () => {
  for (const question of ["", " \n\t ", "x".repeat(501), "🎱".repeat(501)]) {
    const fixture = createInteraction(question)
    await handleEightBallCommand(fixture.interaction, {
      async renderImage() {
        assert.fail("Invalid questions must not render an image")
      },
    })
    assert.deepEqual(fixture.calls, ["reply"])
    assert.deepEqual(fixture.replies, [
      {
        content: "Ask a question between 1 and 500 characters long.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ])
  }
})

test("the registered command renders and sends a real PNG through interactionCreate", async () => {
  const fixture = createInteraction("x".repeat(500))
  fixture.double.client.commands.set("8ball", createEightBallCommand())
  await interactionCreate.execute(fixture.interaction)
  assert.deepEqual(fixture.calls, ["defer", "edit"])
  assert.equal(fixture.edits[0]?.flags, MessageFlags.IsComponentsV2)
  assert.equal(fixture.edits[0]?.files?.length, 1)
  assert.deepEqual(fixture.edits[0]?.allowedMentions, { parse: [] })
  assert.deepEqual(fixture.reports, [])
})

for (const failure of [
  "random",
  "render",
  "view",
  "upload",
  "defer",
  "question",
]) {
  test(`/8ball ${failure} failures settle through the current command error handler`, async (t) => {
    t.mock.method(console, "log", () => undefined)
    t.mock.method(console, "error", () => undefined)
    const fixture = createInteraction()
    if (failure === "defer") {
      t.mock.method(fixture.double, "deferReply", async () => {
        throw new Error("defer failed")
      })
    }
    if (failure === "question") {
      t.mock.method(fixture.double.options, "getString", () => {
        throw new Error("Missing required option")
      })
    }
    if (failure === "upload") {
      const editReply = fixture.double.editReply
      let attempts = 0
      t.mock.method(
        fixture.double,
        "editReply",
        async (reply: InteractionEditReplyOptions) => {
          if (attempts++ === 0) {
            throw new Error("upload failed")
          }
          await editReply(reply)
        }
      )
    }
    fixture.double.client.commands.set(
      "8ball",
      createEightBallCommand({
        handleCommand: (interaction) =>
          handleEightBallCommand(interaction, {
            random: () => (failure === "random" ? NaN : 0),
            async renderImage() {
              if (failure === "render") {
                throw new Error("render failed")
              }
              return Buffer.from("image")
            },
            buildView() {
              if (failure === "view") {
                throw new Error("view failed")
              }
              return { components: [] }
            },
          }),
      })
    )

    await interactionCreate.execute(fixture.interaction)
    const errorReply = {
      content: "Something went wrong while running that command.",
    }
    if (failure === "defer" || failure === "question") {
      assert.deepEqual(fixture.replies, [
        { ...errorReply, flags: MessageFlags.Ephemeral },
      ])
      assert.deepEqual(fixture.edits, [])
    } else {
      assert.deepEqual(fixture.edits, [errorReply])
      assert.deepEqual(fixture.replies, [])
    }
    assert.equal(fixture.reports.length, 1)
    assert.equal(fixture.reports[0]?.commandName, "8ball")
  })
}

test("/8ball error-response failures do not escape the event handler", async (t) => {
  t.mock.method(console, "log", () => undefined)
  t.mock.method(console, "error", () => undefined)
  const fixture = createInteraction()
  t.mock.method(fixture.double, "editReply", async () => {
    throw new Error("Discord unavailable")
  })
  fixture.double.client.commands.set("8ball", createEightBallCommand())
  await interactionCreate.execute(fixture.interaction)
  assert.equal(fixture.reports.length, 1)
})

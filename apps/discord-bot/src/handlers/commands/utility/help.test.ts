import assert from "node:assert/strict"
import { test } from "node:test"

import { MessageFlags } from "discord.js"

import help, { createHelpContent } from "./help"

test("help content omits profile in guild contexts", () => {
  const content = createHelpContent({
    includeModeration: true,
    includeProfile: false,
  })

  assert.match(content, /`\/ping`/)
  assert.match(content, /`\/help`/)
  assert.match(content, /`\/ban`/)
  assert.match(content, /`\/kick`/)
  assert.doesNotMatch(content, /`\/profile`/)
})

test("help content includes profile outside guild contexts", () => {
  const content = createHelpContent({
    includeModeration: false,
    includeProfile: true,
  })

  assert.match(content, /`\/profile`/)
  assert.doesNotMatch(content, /`\/ban`/)
  assert.doesNotMatch(content, /`\/kick`/)
})

test("/help replies with guild-accurate command list", async () => {
  const replies: unknown[] = []

  await help.execute({
    interaction: {
      inGuild: () => true,
      async reply(message: unknown) {
        replies.push(message)
      },
    } as never,
  })

  assert.deepEqual(replies, [
    {
      flags: MessageFlags.Ephemeral,
      content: createHelpContent({
        includeModeration: true,
        includeProfile: false,
      }),
    },
  ])
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { MessageFlags } from "discord.js"

import ping from "./ping"

test("/ping replies, edits with latency details, and handles pending heartbeat", async () => {
  const calls: string[] = []
  const replies: unknown[] = []
  const edits: unknown[] = []

  const interaction = {
    createdTimestamp: Date.now() - 100,
    client: {
      ws: {
        ping: -1,
      },
    },
    async reply(message: unknown) {
      calls.push("reply")
      replies.push(message)
    },
    async editReply(message: unknown) {
      calls.push("editReply")
      edits.push(message)
    },
  }

  await assert.doesNotReject(async () => {
    await ping.execute({ interaction: interaction as never })
  })

  assert.deepEqual(calls, ["reply", "editReply"])
  assert.deepEqual(replies, [
    {
      content: "Pinging...",
      flags: MessageFlags.Ephemeral,
    },
  ])

  const editContent = edits[0]

  assert.equal(typeof editContent, "string")
  const editText = editContent as string

  assert.match(editText, /^Pong!/)
  assert.match(editText, /Gateway dispatch: `\d+ms`/)
  assert.match(editText, /Reply REST latency: `\d+ms`/)
  assert.match(editText, /Total interaction latency: `\d+ms`/)
  assert.match(editText, /Gateway heartbeat: `Calculating\.\.\.`/)
})

import assert from "node:assert/strict"
import { test } from "node:test"

import type { AttachmentPayload, GuildMember } from "discord.js"

import {
  loadWelcomeAvatar,
  renderWelcomeCardMessage,
} from "./welcomeCardRenderer"

test("welcome card renderer returns a PNG attachment", async () => {
  const message = await renderWelcomeCardMessage(createMember())
  const file = getAttachmentPayload(message.files?.[0])
  const attachment = file?.attachment

  assert.equal(message.content, "Welcome <@345678901234567890> to Cleo HQ")
  assert.equal(file?.name, "cleo-welcome.png")
  assert.ok(Buffer.isBuffer(attachment))
  assert.deepEqual(
    Array.from(attachment.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  )
})

test("welcome avatar loading falls back when Discord CDN loading fails", async () => {
  const avatar = await loadWelcomeAvatar(
    "https://cdn.discordapp.com/avatar.png",
    async () => {
      throw new Error("avatar unavailable")
    }
  )

  assert.equal(avatar, null)
})

function getAttachmentPayload(file: unknown): AttachmentPayload | null {
  if (file && typeof file === "object" && "attachment" in file) {
    return file as AttachmentPayload
  }

  return null
}

function createMember(): GuildMember {
  return {
    id: "345678901234567890",
    displayName: "Jason",
    user: {
      id: "345678901234567890",
      bot: false,
      username: "Jason",
    },
    guild: {
      id: "123456789012345678",
      name: "Cleo HQ",
    },
  } as unknown as GuildMember
}

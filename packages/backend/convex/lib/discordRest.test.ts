import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { canInstallBotToGuild, fetchDiscordGuildChannels } from "./discordRest"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("allows Discord guild installs with Manage Server permission", () => {
  assert.equal(
    canInstallBotToGuild({
      isOwner: true,
      permissions: "0",
    }),
    true
  )

  assert.equal(
    canInstallBotToGuild({
      isOwner: false,
      permissions: "8",
    }),
    true
  )

  assert.equal(
    canInstallBotToGuild({
      isOwner: false,
      permissions: "32",
    }),
    true
  )

  assert.equal(
    canInstallBotToGuild({
      isOwner: false,
      permissions: "0",
    }),
    false
  )

  assert.equal(
    canInstallBotToGuild({
      isOwner: false,
      permissions: undefined,
    }),
    false
  )
})

test("Discord guild channel endpoint preserves denied and not-installed semantics", async () => {
  const cases = [
    {
      status: 401,
      expected: {
        status: "unavailable",
        reason: "discordRestDeniedAccess",
      },
    },
    { status: 403, expected: { status: "notInstalled" } },
    { status: 404, expected: { status: "notInstalled" } },
  ] as const

  for (const testCase of cases) {
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      return new Response(null, { status: testCase.status })
    }

    const result = await fetchDiscordGuildChannels("guild-id", "test-token")
    assert.deepEqual(result, testCase.expected)
    assert.equal(calls, 1)
  }
})

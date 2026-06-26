import assert from "node:assert/strict"
import { test } from "node:test"

import { toBotDiscordProfileResult } from "./byDiscordUserId"

test("bot Discord profile result exposes only safe account fields", () => {
  const result = toBotDiscordProfileResult(
    {
      displayName: "Jason",
      role: "staff",
      status: undefined,
    },
    {
      username: "jason",
      displayName: "Jason Discord",
    }
  )

  assert.deepEqual(result, {
    status: "linked",
    account: {
      displayName: "Jason",
      role: "staff",
      status: "active",
    },
    discordIdentity: {
      username: "jason",
      displayName: "Jason Discord",
    },
  })

  const encoded = JSON.stringify(result)

  assert.equal(encoded.includes("clerk"), false)
  assert.equal(encoded.includes("email"), false)
  assert.equal(encoded.includes("token"), false)
  assert.equal(encoded.includes("billing"), false)
})

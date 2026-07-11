import assert from "node:assert/strict"
import { test } from "node:test"

import { resolveWelcomePreviewTarget } from "./sendWelcomePreview"

test("welcome preview target resolves guild and user from CLI args", () => {
  assert.deepEqual(
    resolveWelcomePreviewTarget(
      [
        "node",
        "sendWelcomePreview.ts",
        "--guild=123456789012345678",
        "--user",
        "jason",
      ],
      undefined,
      {}
    ),
    {
      guildId: "123456789012345678",
      userQuery: "jason",
      mode: "card",
    }
  )
})

test("welcome preview target uses test guild and env user defaults", () => {
  assert.deepEqual(
    resolveWelcomePreviewTarget(
      ["node", "sendWelcomePreview.ts"],
      "123456789012345678",
      {
        DISCORD_WELCOME_PREVIEW_USER: "345678901234567890",
      }
    ),
    {
      guildId: "123456789012345678",
      userQuery: "345678901234567890",
      mode: "card",
    }
  )
})

test("welcome preview target resolves channel, message, and both mode", () => {
  assert.deepEqual(
    resolveWelcomePreviewTarget(
      [
        "node",
        "sendWelcomePreview.ts",
        "--guild=123456789012345678",
        "--user=345678901234567890",
        "--channel",
        "456789012345678901",
        "--message=Welcome {user} to {guild}",
        "--subtext=Read the rules and grab a role.",
        "--both",
      ],
      undefined,
      {}
    ),
    {
      guildId: "123456789012345678",
      userQuery: "345678901234567890",
      channelId: "456789012345678901",
      message: "Welcome {user} to {guild}",
      subtext: "Read the rules and grab a role.",
      mode: "both",
    }
  )
})

test("welcome preview target resolves explicit fallback mode", () => {
  assert.equal(
    resolveWelcomePreviewTarget(
      [
        "node",
        "sendWelcomePreview.ts",
        "--guild=123456789012345678",
        "--user=345678901234567890",
        "--mode=fallback",
      ],
      undefined,
      {}
    ).mode,
    "fallback"
  )
})

test("welcome preview target rejects missing user", () => {
  assert.throws(
    () =>
      resolveWelcomePreviewTarget(
        ["node", "sendWelcomePreview.ts"],
        "123456789012345678",
        {}
      ),
    /Missing preview user/
  )
})

test("welcome preview target does not consume the next flag as a value", () => {
  assert.throws(
    () =>
      resolveWelcomePreviewTarget(
        [
          "node",
          "sendWelcomePreview.ts",
          "--guild=123456789012345678",
          "--user",
          "--mode=fallback",
        ],
        undefined,
        {}
      ),
    /Missing preview user/
  )
})

test("welcome preview target rejects invalid guild IDs", () => {
  assert.throws(
    () =>
      resolveWelcomePreviewTarget(
        [
          "node",
          "sendWelcomePreview.ts",
          "--guild=not-a-guild",
          "--user=jason",
        ],
        undefined,
        {}
      ),
    /Guild ID must be a Discord snowflake/
  )
})

test("welcome preview target rejects invalid channel IDs", () => {
  assert.throws(
    () =>
      resolveWelcomePreviewTarget(
        [
          "node",
          "sendWelcomePreview.ts",
          "--guild=123456789012345678",
          "--user=jason",
          "--channel=not-a-channel",
        ],
        undefined,
        {}
      ),
    /Channel ID must be a Discord snowflake/
  )
})

test("welcome preview target rejects invalid modes", () => {
  assert.throws(
    () =>
      resolveWelcomePreviewTarget(
        [
          "node",
          "sendWelcomePreview.ts",
          "--guild=123456789012345678",
          "--user=jason",
          "--mode=unknown",
        ],
        undefined,
        {}
      ),
    /Invalid --mode/
  )
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { createErrorLogDocument } from "./create"

test("error log documents redact message, stack, and metadata", () => {
  assert.deepEqual(
    createErrorLogDocument(
      {
        source: "discord-bot",
        level: "error",
        message: "Failed for user@example.com with token=secret",
        stack:
          "Error: Failed for user@example.com\n    at run (https://user:pass@example.com/path?token=secret)",
        metadata: {
          guild: {
            guildId: "guild_123",
            discordGuildId: "111111111111111111",
          },
          emailAddress: "user@example.com",
          nested: {
            message: "Contact user@example.com",
            cookie: "session=secret",
          },
        },
      },
      1_000
    ),
    {
      source: "discord-bot",
      level: "error",
      message: "Failed for [redacted] with token=[redacted]",
      stack:
        "Error: Failed for [redacted]\n    at run (https://[redacted]@example.com/path?token=[redacted])",
      guildId: "guild_123",
      discordGuildId: "111111111111111111",
      metadata: {
        guild: {
          guildId: "guild_123",
          discordGuildId: "111111111111111111",
        },
        emailAddress: "[redacted]",
        nested: {
          message: "Contact [redacted]",
          cookie: "[redacted]",
        },
      },
      createdAt: 1_000,
    }
  )
})

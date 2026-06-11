import assert from "node:assert/strict"
import { test } from "node:test"

import type { DiscordGuildRuntimeConfig } from "./guildRuntimeConfig"
import { validateDiscordGuildRuntimeConfigBackendResult } from "./guildRuntimeConfig"

const guildId = "123456789012345678"
const otherGuildId = "234567890123456789"

const validConfig: DiscordGuildRuntimeConfig = {
  discordGuildId: guildId,
  moderationEnabled: false,
  welcomeEnabled: true,
  loggingEnabled: true,
  logLevel: "medium",
  logChannelId: "345678901234567890",
  modLogChannelId: "456789012345678901",
  welcomeChannelId: "567890123456789012",
  updatesChannelId: "678901234567890123",
  announcementChannelId: "789012345678901234",
}

test("runtime config validation rejects invalid guild IDs", () => {
  const errors: string[] = []

  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: "not-a-guild-id",
      backendResult: {
        status: "ready",
        config: validConfig,
      },
      onError(message) {
        errors.push(message)
      },
    }),
    {
      status: "disabled",
      reason: "invalidGuildId",
    }
  )

  assert.deepEqual(errors, [
    "Invalid Discord guild ID for runtime config fetch.",
  ])
})

test("runtime config validation maps missing backend responses to disabled config", () => {
  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: null,
    }),
    {
      status: "disabled",
      reason: "convexUnavailable",
    }
  )
})

test("runtime config validation preserves backend disabled reasons", () => {
  for (const reason of ["unknownGuild", "botLeft", "missingConfig"] as const) {
    assert.deepEqual(
      validateDiscordGuildRuntimeConfigBackendResult({
        discordGuildId: guildId,
        backendResult: {
          status: "disabled",
          reason,
        },
      }),
      {
        status: "disabled",
        reason,
      }
    )
  }
})

test("runtime config validation rejects malformed backend results", () => {
  const errors: string[] = []

  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: {
        status: "ready",
        config: {
          ...validConfig,
          logChannelId: "bad-channel-id",
        },
      },
      onError(message) {
        errors.push(message)
      },
    }),
    {
      status: "disabled",
      reason: "invalidBackendResponse",
    }
  )

  assert.deepEqual(errors, ["Invalid Convex guild runtime config response."])
})

test("runtime config validation rejects mismatched backend guild IDs", () => {
  const errors: string[] = []

  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: {
        status: "ready",
        config: {
          ...validConfig,
          discordGuildId: otherGuildId,
        },
      },
      onError(message) {
        errors.push(message)
      },
    }),
    {
      status: "disabled",
      reason: "invalidBackendResponse",
    }
  )

  assert.deepEqual(errors, [
    "Invalid Convex guild runtime config response.",
  ])
})

test("runtime config validation accepts valid backend results", () => {
  assert.deepEqual(
    validateDiscordGuildRuntimeConfigBackendResult({
      discordGuildId: guildId,
      backendResult: {
        status: "ready",
        config: validConfig,
      },
    }),
    {
      status: "ready",
      config: validConfig,
    }
  )
})

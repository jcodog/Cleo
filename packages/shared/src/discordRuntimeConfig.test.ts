import assert from "node:assert/strict"
import { test } from "node:test"

import {
  BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS,
  DISCORD_GUILD_RUNTIME_CONFIG_FIELD_NAMES,
  DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS,
  isDiscordSnowflake,
  validateBackendDiscordGuildRuntimeConfigResult,
  type BackendDiscordGuildRuntimeConfigResult,
  type DiscordGuildRuntimeConfig,
} from "./discordRuntimeConfig"

const guildId = "123456789012345678"

const validConfig = {
  discordGuildId: guildId,
  moderationEnabled: false,
  welcomeEnabled: true,
  loggingEnabled: true,
  logLevel: "medium",
  logChannelId: "234567890123456789",
  modLogChannelId: "345678901234567890",
  welcomeChannelId: "456789012345678901",
  updatesChannelId: "567890123456789012",
  announcementChannelId: "678901234567890123",
} satisfies DiscordGuildRuntimeConfig

test("Discord snowflake validation is shared and deterministic", () => {
  assert.equal(isDiscordSnowflake(guildId), true)
  assert.equal(isDiscordSnowflake("123"), false)
  assert.equal(isDiscordSnowflake("not-a-guild"), false)
})

test("runtime-config contract exposes stable variants and field names", () => {
  assert.deepEqual(BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS, [
    "unknownGuild",
    "botLeft",
    "missingConfig",
  ])
  assert.deepEqual(DISCORD_GUILD_RUNTIME_CONFIG_LOG_LEVELS, [
    "none",
    "minimal",
    "medium",
    "maximum",
  ])
  assert.deepEqual(DISCORD_GUILD_RUNTIME_CONFIG_FIELD_NAMES, [
    "discordGuildId",
    "moderationEnabled",
    "welcomeEnabled",
    "loggingEnabled",
    "logLevel",
    "logChannelId",
    "modLogChannelId",
    "welcomeChannelId",
    "updatesChannelId",
    "announcementChannelId",
  ])
})

test("runtime-config validator accepts enabled and disabled backend variants", () => {
  const readyResult = validateBackendDiscordGuildRuntimeConfigResult(
    {
      status: "ready",
      config: validConfig,
    } satisfies BackendDiscordGuildRuntimeConfigResult,
    guildId
  )

  assert.deepEqual(readyResult, {
    success: true,
    data: {
      status: "ready",
      config: validConfig,
    },
  })

  for (const reason of BACKEND_DISCORD_GUILD_RUNTIME_CONFIG_DISABLED_REASONS) {
    assert.deepEqual(
      validateBackendDiscordGuildRuntimeConfigResult({
        status: "disabled",
        reason,
      }),
      {
        success: true,
        data: {
          status: "disabled",
          reason,
        },
      }
    )
  }
})

test("runtime-config validator rejects malformed and mismatched responses", () => {
  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult(null).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "departed",
    }).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "disabled",
      reason: "botLeft",
      extra: true,
    }).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "ready",
      config: {
        ...validConfig,
        logChannelId: "bad-channel",
      },
    }).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "ready",
      config: validConfig,
      extra: true,
    }).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "ready",
      config: null,
    }).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "ready",
      config: {
        ...validConfig,
        extra: true,
      },
    }).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "ready",
      config: {
        ...validConfig,
        discordGuildId: "bad-guild",
      },
    }).success,
    false
  )

  for (const fieldName of [
    "moderationEnabled",
    "welcomeEnabled",
    "loggingEnabled",
  ] as const) {
    assert.equal(
      validateBackendDiscordGuildRuntimeConfigResult({
        status: "ready",
        config: {
          ...validConfig,
          [fieldName]: "bad",
        },
      }).success,
      false
    )
  }

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "ready",
      config: {
        ...validConfig,
        logLevel: "verbose",
      },
    }).success,
    false
  )

  for (const fieldName of [
    "logChannelId",
    "modLogChannelId",
    "welcomeChannelId",
    "updatesChannelId",
    "announcementChannelId",
  ] as const) {
    assert.equal(
      validateBackendDiscordGuildRuntimeConfigResult({
        status: "ready",
        config: {
          ...validConfig,
          [fieldName]: "bad-channel",
        },
      }).success,
      false
    )
  }

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult(
      {
        status: "ready",
        config: {
          ...validConfig,
          discordGuildId: "987654321098765432",
        },
      },
      guildId
    ).success,
    false
  )

  assert.equal(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "disabled",
      reason: "departed",
    }).success,
    false
  )
})

test("runtime-config validator accepts configs without optional fields", () => {
  assert.deepEqual(
    validateBackendDiscordGuildRuntimeConfigResult({
      status: "ready",
      config: {
        discordGuildId: guildId,
        moderationEnabled: false,
        welcomeEnabled: false,
        loggingEnabled: false,
      },
    }),
    {
      success: true,
      data: {
        status: "ready",
        config: {
          discordGuildId: guildId,
          moderationEnabled: false,
          welcomeEnabled: false,
          loggingEnabled: false,
        },
      },
    }
  )
})

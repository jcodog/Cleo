import { createEnv } from "@t3-oss/env-core"

import { nodeEnv, optionalString, optionalUrl } from "./shared"

const runtimeModes = ["single", "sharded"] as const

export type DiscordBotRuntimeMode = (typeof runtimeModes)[number]
export type DiscordBotShardCount = "auto" | number

type RuntimeConfigEnv = {
  NODE_ENV?: string
  DISCORD_BOT_RUNTIME_MODE?: string
  DISCORD_BOT_SHARD_COUNT?: string
}

export const discordEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,
    CONVEX_URL: optionalUrl,
    DISCORD_BOT_CONVEX_SECRET: optionalString,
    DISCORD_BOT_TOKEN: optionalString,
    DISCORD_BOT_RUNTIME_MODE: optionalString,
    DISCORD_BOT_SHARD_COUNT: optionalString,
    DISCORD_BOT_PERMISSIONS: optionalString,
    // DISCORD_PUBLIC_KEY: optionalString,
    DISCORD_CLIENT_ID: optionalString,
    DISCORD_APPLICATION_ID: optionalString,
    DISCORD_TEST_GUILD_ID: optionalString,
    DISCORD_INSTALL_REDIRECT_URI: optionalUrl,
    // OPENAI_API_KEY: optionalString,
  },
  runtimeEnv: process.env,
})

export function resolveDiscordBotRuntimeConfig(
  env: RuntimeConfigEnv = process.env
) {
  return {
    mode: resolveDiscordBotRuntimeMode(env.DISCORD_BOT_RUNTIME_MODE),
    shardCount: resolveDiscordBotShardCount(env.DISCORD_BOT_SHARD_COUNT),
  }
}

export function resolveDiscordBotRuntimeMode(
  value: string | undefined
): DiscordBotRuntimeMode {
  const normalizedValue = value?.trim().toLowerCase()

  if (!normalizedValue) {
    return "single"
  }

  if (isDiscordBotRuntimeMode(normalizedValue)) {
    return normalizedValue
  }

  throw new Error(
    `Invalid DISCORD_BOT_RUNTIME_MODE "${value}". Expected "single" or "sharded".`
  )
}

export function resolveDiscordBotShardCount(
  value: string | undefined
): DiscordBotShardCount {
  const normalizedValue = value?.trim().toLowerCase()

  if (!normalizedValue || normalizedValue === "auto") {
    return "auto"
  }

  if (!/^[1-9]\d*$/.test(normalizedValue)) {
    throw new Error(
      `Invalid DISCORD_BOT_SHARD_COUNT "${value}". Expected "auto" or a positive safe integer.`
    )
  }

  const shardCount = Number(normalizedValue)

  if (!Number.isSafeInteger(shardCount)) {
    throw new Error(
      `Invalid DISCORD_BOT_SHARD_COUNT "${value}". Expected "auto" or a positive safe integer.`
    )
  }

  return shardCount
}

function isDiscordBotRuntimeMode(
  value: string
): value is DiscordBotRuntimeMode {
  return runtimeModes.includes(value as DiscordBotRuntimeMode)
}

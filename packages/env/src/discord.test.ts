import assert from "node:assert/strict"
import { test } from "node:test"

import {
  resolveDiscordBotRuntimeConfig,
  resolveDiscordBotRuntimeMode,
  resolveDiscordBotShardCount,
} from "./discord"

test("Discord bot runtime mode resolver accepts single and sharded", () => {
  assert.equal(resolveDiscordBotRuntimeMode("single"), "single")
  assert.equal(resolveDiscordBotRuntimeMode("sharded"), "sharded")
})

test("Discord bot runtime mode resolver rejects invalid values", () => {
  assert.throws(
    () => resolveDiscordBotRuntimeMode("clustered"),
    /Invalid DISCORD_BOT_RUNTIME_MODE "clustered"/
  )
})

test("Discord bot runtime mode defaults local dev and test to single", () => {
  assert.equal(
    resolveDiscordBotRuntimeConfig({ NODE_ENV: "development" }).mode,
    "single"
  )
  assert.equal(
    resolveDiscordBotRuntimeConfig({ NODE_ENV: "test" }).mode,
    "single"
  )
  assert.equal(
    resolveDiscordBotRuntimeConfig({ NODE_ENV: undefined }).mode,
    "single"
  )
})

test("Discord bot runtime mode fails clearly for invalid production values", () => {
  assert.throws(
    () =>
      resolveDiscordBotRuntimeConfig({
        NODE_ENV: "production",
        DISCORD_BOT_RUNTIME_MODE: "invalid",
      }),
    /Invalid DISCORD_BOT_RUNTIME_MODE "invalid". Expected "single" or "sharded"./
  )
})

test("Discord bot shard count accepts auto and positive safe integers", () => {
  assert.equal(resolveDiscordBotShardCount(undefined), "auto")
  assert.equal(resolveDiscordBotShardCount("auto"), "auto")
  assert.equal(resolveDiscordBotShardCount("1"), 1)
  assert.equal(resolveDiscordBotShardCount("16"), 16)
  assert.equal(
    resolveDiscordBotShardCount(String(Number.MAX_SAFE_INTEGER)),
    Number.MAX_SAFE_INTEGER
  )
})

test("Discord bot shard count rejects invalid values", () => {
  for (const value of ["0", "-1", "1.5", "NaN", "unsafe", "9007199254740992"]) {
    assert.throws(
      () => resolveDiscordBotShardCount(value),
      /Invalid DISCORD_BOT_SHARD_COUNT/
    )
  }
})

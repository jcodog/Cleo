import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

import type { ShardingManager, ShardingManagerOptions } from "discord.js"

import type { BotClient } from "@/classes/Client"

import {
  isDiscordShardingWorker,
  startBotClientRuntime,
  startShardingManagerRuntime,
} from "./startup"

class FakeProcess extends EventEmitter {
  public override once(
    eventName: string,
    listener: (...args: unknown[]) => void
  ) {
    return super.once(eventName, listener)
  }

  public override on(
    eventName: string,
    listener: (...args: unknown[]) => void
  ) {
    return super.on(eventName, listener)
  }
}

class FakeShardingManager extends EventEmitter {
  public readonly shards = new Map()
  public respawn = true
  public spawnCalls = 0

  public async spawn(): Promise<void> {
    this.spawnCalls += 1
  }
}

test("single startup path invokes the existing BotClient startup", async (t) => {
  const startedWithTokens: Array<string | undefined> = []
  const runtimeConfigChecks: string[] = []
  const fakeClient = {
    async start(token: string | undefined) {
      startedWithTokens.push(token)
    },
  } as BotClient

  t.mock.method(console, "log", () => undefined)

  await startBotClientRuntime({
    mode: "single",
    token: "bot-token",
    createClient: () => fakeClient,
    assertRuntimeConfig: () => {
      runtimeConfigChecks.push("checked")
    },
    processLike: new FakeProcess() as NodeJS.Process,
    exit: () => undefined,
    shutdown: async () => {
      throw new Error("shutdown should not run")
    },
  })

  assert.deepEqual(runtimeConfigChecks, ["checked"])
  assert.deepEqual(startedWithTokens, ["bot-token"])
})

test("sharded startup path invokes the manager path without dashboard guild config", async (t) => {
  let createdWithFile = ""
  let createdWithOptions: ShardingManagerOptions | undefined
  const fakeManager = new FakeShardingManager()

  t.mock.method(console, "log", () => undefined)

  const manager = await startShardingManagerRuntime({
    shardCount: 4,
    token: "bot-token",
    entrypoint: "src/index.ts",
    processLike: new FakeProcess() as NodeJS.Process,
    exit: () => undefined,
    shutdown: async () => {
      throw new Error("shutdown should not run")
    },
    createManager(file, options) {
      createdWithFile = file
      createdWithOptions = options
      return fakeManager as unknown as ShardingManager
    },
  })

  const startupSource = await readFile(
    new URL("./startup.ts", import.meta.url),
    "utf8"
  )

  assert.equal(manager, fakeManager)
  assert.equal(fakeManager.spawnCalls, 1)
  assert.equal(createdWithFile, "src/index.ts")
  assert.deepEqual(createdWithOptions, {
    token: "bot-token",
    totalShards: 4,
    respawn: true,
  })
  assert.equal(startupSource.includes("guildRuntimeConfig"), false)
})

test("sharded worker detection requires shard-specific environment", () => {
  assert.equal(
    isDiscordShardingWorker({
      SHARDING_MANAGER: "true",
      SHARDS: "0",
    }),
    true
  )
  assert.equal(
    isDiscordShardingWorker({
      SHARDING_MANAGER: "true",
    }),
    false
  )
})

import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"

import type { Shard, ShardingManager, ShardingManagerOptions } from "discord.js"

import type { BotClient } from "@/classes/Client"

import {
  isDiscordShardingWorker,
  resolveShardExecArgv,
  startBotClientRuntime,
  startDiscordBotRuntimeFromEnv,
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
  public spawnError: Error | undefined

  public async spawn(): Promise<void> {
    this.spawnCalls += 1

    if (this.spawnError) {
      throw this.spawnError
    }
  }
}

function createFakeClient(startError?: Error): BotClient {
  return {
    client: undefined,
    async start() {
      if (startError) {
        throw startError
      }
    },
  } as unknown as BotClient
}

test("runtime dispatches a sharding worker directly to the client", async () => {
  const env = {
    DISCORD_BOT_TOKEN: "worker-token",
    SHARDING_MANAGER: "true",
    SHARDS: "0",
  }
  const clientStarts: unknown[] = []

  await startDiscordBotRuntimeFromEnv({
    entrypoint: "C:/release/dist/index.js",
    env,
    resolveRuntimeConfig() {
      throw new Error("worker must not resolve manager configuration")
    },
    async startClientRuntime(options) {
      clientStarts.push(options)
      return {} as never
    },
    async startManagerRuntime() {
      throw new Error("worker must not start a manager")
    },
  })

  assert.deepEqual(clientStarts, [
    { mode: "sharded", token: "worker-token", env },
  ])
})

test("runtime dispatches single-process configuration to the client", async () => {
  const env = {
    DISCORD_BOT_RUNTIME_MODE: "single",
    DISCORD_BOT_TOKEN: "single-token",
  }
  const clientStarts: unknown[] = []

  await startDiscordBotRuntimeFromEnv({
    entrypoint: "C:/release/dist/index.js",
    env,
    resolveRuntimeConfig() {
      return { mode: "single", shardCount: "auto" }
    },
    async startClientRuntime(options) {
      clientStarts.push(options)
      return {} as never
    },
    async startManagerRuntime() {
      throw new Error("single mode must not start a manager")
    },
  })

  assert.deepEqual(clientStarts, [
    { mode: "single", token: "single-token", env },
  ])
})

test("runtime passes an explicit shard count and compiled entrypoint", async () => {
  const managerStarts: unknown[] = []

  await startDiscordBotRuntimeFromEnv({
    entrypoint: "/srv/cleo/discord-bot/current/dist/index.js",
    env: {
      DISCORD_BOT_RUNTIME_MODE: "sharded",
      DISCORD_BOT_TOKEN: "manager-token",
    },
    resolveRuntimeConfig() {
      return { mode: "sharded", shardCount: 4 }
    },
    async startClientRuntime() {
      throw new Error("manager mode must not start a client directly")
    },
    async startManagerRuntime(options) {
      managerStarts.push(options)
      return {} as never
    },
  })

  assert.deepEqual(managerStarts, [
    {
      shardCount: 4,
      token: "manager-token",
      entrypoint: "/srv/cleo/discord-bot/current/dist/index.js",
    },
  ])
})

test("runtime configuration failures stop before client or manager startup", async () => {
  const configError = new Error("invalid runtime configuration")

  await assert.rejects(
    startDiscordBotRuntimeFromEnv({
      entrypoint: "dist/index.js",
      env: {},
      resolveRuntimeConfig() {
        throw configError
      },
      async startClientRuntime() {
        throw new Error("client must not start")
      },
      async startManagerRuntime() {
        throw new Error("manager must not start")
      },
    }),
    configError
  )
})

test("single-process startup validates configuration and starts the client", async (t) => {
  const startedWithTokens: Array<string | undefined> = []
  const runtimeConfigChecks: string[] = []
  const fakeClient = {
    async start(token: string | undefined) {
      startedWithTokens.push(token)
    },
  } as BotClient

  t.mock.method(console, "log", () => undefined)

  const client = await startBotClientRuntime({
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

  assert.equal(client, fakeClient)
  assert.deepEqual(runtimeConfigChecks, ["checked"])
  assert.deepEqual(startedWithTokens, ["bot-token"])
})

test("sharded worker startup logs shard environment and starts the client", async (t) => {
  const logLines: string[] = []

  t.mock.method(console, "log", (line: string) => logLines.push(line))

  await startBotClientRuntime({
    mode: "sharded",
    token: "bot-token",
    createClient: () => createFakeClient(),
    assertRuntimeConfig: () => undefined,
    processLike: new FakeProcess() as NodeJS.Process,
    exit: () => undefined,
    env: { SHARDS: "0", SHARD_COUNT: "4" },
  })

  assert.match(logLines[0] ?? "", /shards=0, shardCount=4/)

  await startBotClientRuntime({
    mode: "sharded",
    token: "bot-token",
    createClient: () => createFakeClient(),
    assertRuntimeConfig: () => undefined,
    processLike: new FakeProcess() as NodeJS.Process,
    exit: () => undefined,
    env: {},
  })

  assert.match(logLines[1] ?? "", /shards=unknown, shardCount=unknown/)
})

test("client startup fails explicitly when the Discord token is missing", async () => {
  let created = false

  await assert.rejects(
    startBotClientRuntime({
      mode: "single",
      token: "",
      createClient() {
        created = true
        return createFakeClient()
      },
    }),
    /Missing environment variable DISCORD_BOT_TOKEN/
  )

  assert.equal(created, false)
})

test("runtime configuration failure triggers structured startup shutdown", async () => {
  const configError = new Error("missing Convex configuration")
  const fakeClient = createFakeClient()
  const shutdownCalls: Array<{
    client: unknown
    error: unknown
    exitCode: number
    reason: string
  }> = []

  await assert.rejects(
    startBotClientRuntime({
      mode: "single",
      token: "bot-token",
      createClient: () => fakeClient,
      assertRuntimeConfig() {
        throw configError
      },
      processLike: new FakeProcess() as NodeJS.Process,
      exit: () => undefined,
      async shutdown(options) {
        shutdownCalls.push({
          client: options.client,
          error: options.error,
          exitCode: options.exitCode,
          reason: options.reason,
        })
      },
    }),
    configError
  )

  assert.equal(shutdownCalls.length, 1)
  assert.deepEqual(shutdownCalls[0], {
    client: fakeClient,
    reason: "startupFailure",
    exitCode: 1,
    error: configError,
  })
})

test("client login failure triggers startup shutdown and is rethrown", async () => {
  const loginError = new Error("Discord login failed")
  const shutdownReasons: string[] = []

  await assert.rejects(
    startBotClientRuntime({
      mode: "single",
      token: "bot-token",
      createClient: () => createFakeClient(loginError),
      assertRuntimeConfig: () => undefined,
      processLike: new FakeProcess() as NodeJS.Process,
      exit: () => undefined,
      async shutdown(options) {
        shutdownReasons.push(options.reason)
        assert.equal(options.error, loginError)
      },
    }),
    loginError
  )

  assert.deepEqual(shutdownReasons, ["startupFailure"])
})

test("compiled sharding starts JavaScript workers without the tsx hook", async (t) => {
  let createdWithFile = ""
  let createdWithOptions: ShardingManagerOptions | undefined
  const fakeManager = new FakeShardingManager()
  const processLike = new FakeProcess()
  const shutdownCalls: unknown[] = []

  t.mock.method(console, "log", () => undefined)

  const manager = await startShardingManagerRuntime({
    shardCount: 4,
    token: "bot-token",
    entrypoint: "/release/dist/index.js",
    processLike: processLike as NodeJS.Process,
    exit: () => undefined,
    shutdown: async (options) => {
      shutdownCalls.push(options)
    },
    createManager(file, options) {
      createdWithFile = file
      createdWithOptions = options
      return fakeManager as unknown as ShardingManager
    },
  })

  assert.equal(manager, fakeManager)
  assert.equal(fakeManager.spawnCalls, 1)
  assert.equal(createdWithFile, "/release/dist/index.js")
  assert.deepEqual(createdWithOptions, {
    execArgv: [],
    token: "bot-token",
    totalShards: 4,
    respawn: true,
  })

  processLike.emit("SIGTERM")

  assert.equal(shutdownCalls.length, 1)
  assert.equal(
    (shutdownCalls[0] as { manager: unknown }).manager,
    fakeManager
  )
  assert.equal(
    (shutdownCalls[0] as { reason: string }).reason,
    "SIGTERM"
  )
})

test("development sharding preserves the tsx import hook", () => {
  assert.deepEqual(resolveShardExecArgv("C:/repo/src/index.ts"), [
    "--import",
    "tsx",
  ])
  assert.deepEqual(resolveShardExecArgv("/release/dist/index.js"), [])
})

test("sharding manager fails before construction when the token is missing", async () => {
  let managerCreated = false

  await assert.rejects(
    startShardingManagerRuntime({
      shardCount: "auto",
      token: "",
      entrypoint: "/release/dist/index.js",
      createManager() {
        managerCreated = true
        return new FakeShardingManager() as unknown as ShardingManager
      },
    }),
    /Missing environment variable DISCORD_BOT_TOKEN/
  )

  assert.equal(managerCreated, false)
})

test("sharding manager startup failure triggers shutdown and is rethrown", async (t) => {
  const spawnError = new Error("shard spawn failed")
  const fakeManager = new FakeShardingManager()
  const shutdownReasons: string[] = []
  fakeManager.spawnError = spawnError

  t.mock.method(console, "log", () => undefined)

  await assert.rejects(
    startShardingManagerRuntime({
      shardCount: "auto",
      token: "bot-token",
      entrypoint: "/release/dist/index.js",
      createManager: () => fakeManager as unknown as ShardingManager,
      processLike: new FakeProcess() as NodeJS.Process,
      exit: () => undefined,
      async shutdown(options) {
        shutdownReasons.push(options.reason)
        assert.equal(options.error, spawnError)
      },
    }),
    spawnError
  )

  assert.deepEqual(shutdownReasons, ["startupFailure"])
})

test("shard creation and shard errors are logged structurally", async (t) => {
  const fakeManager = new FakeShardingManager()
  const shard = new EventEmitter() as unknown as Shard & EventEmitter
  Object.defineProperty(shard, "id", { value: 2 })
  const logLines: string[] = []
  const errorLines: string[] = []

  t.mock.method(console, "log", (line: string) => logLines.push(line))
  t.mock.method(console, "error", (line: string) => errorLines.push(line))

  await startShardingManagerRuntime({
    shardCount: 4,
    token: "bot-token",
    entrypoint: "/release/dist/index.js",
    createManager: () => fakeManager as unknown as ShardingManager,
    processLike: new FakeProcess() as NodeJS.Process,
    exit: () => undefined,
  })

  fakeManager.emit("shardCreate", shard)
  shard.emit("error", new Error("worker failed token=secret"))

  assert.equal(logLines.length, 2)
  assert.match(logLines[1] ?? "", /Created Discord shard 2/)
  assert.match(errorLines[0] ?? "", /token=\[redacted\]/)
  assert.match(errorLines[0] ?? "", /"shardId":2/)
})

test("shutdown handlers run once and preserve the first reason", async (t) => {
  const cases = [
    ["SIGINT", undefined],
    ["SIGTERM", undefined],
    ["unhandledRejection", new Error("rejected")],
    ["uncaughtException", new Error("uncaught")],
  ] as const

  t.mock.method(console, "log", () => undefined)

  for (const [eventName, error] of cases) {
    const processLike = new FakeProcess()
    const shutdownCalls: unknown[][] = []

    await startBotClientRuntime({
      mode: "single",
      token: "bot-token",
      createClient: () => createFakeClient(),
      assertRuntimeConfig: () => undefined,
      processLike: processLike as NodeJS.Process,
      exit: () => undefined,
      async shutdown(options) {
        shutdownCalls.push([options.reason, options.exitCode, options.error])
      },
    })

    processLike.emit(eventName, error)
    processLike.emit("unhandledRejection", new Error("duplicate"))

    const expectedExitCode = eventName.startsWith("SIG") ? 0 : 1
    assert.deepEqual(shutdownCalls, [[eventName, expectedExitCode, error]])
  }
})

test("startup installs one shutdown handler set per process", async (t) => {
  const processLike = new FakeProcess()

  t.mock.method(console, "log", () => undefined)

  for (let index = 0; index < 2; index += 1) {
    await startBotClientRuntime({
      mode: "single",
      token: "bot-token",
      createClient: () => createFakeClient(),
      assertRuntimeConfig: () => undefined,
      processLike: processLike as NodeJS.Process,
      exit: () => undefined,
    })
  }

  assert.equal(processLike.listenerCount("SIGINT"), 1)
  assert.equal(processLike.listenerCount("SIGTERM"), 1)
  assert.equal(processLike.listenerCount("unhandledRejection"), 1)
  assert.equal(processLike.listenerCount("uncaughtException"), 1)
})

test("sharding worker detection requires both manager fields", () => {
  assert.equal(
    isDiscordShardingWorker({ SHARDING_MANAGER: "true", SHARDS: "0" }),
    true
  )
  assert.equal(
    isDiscordShardingWorker({ SHARDING_MANAGER: "false", SHARDS: "0" }),
    false
  )
  assert.equal(isDiscordShardingWorker({ SHARDING_MANAGER: "true" }), false)
})

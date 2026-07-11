import { fileURLToPath } from "node:url"

import { ShardingManager, type Client, type Shard } from "discord.js"

import { BotClient } from "@/classes/Client"
import { botLog, botLogError } from "@/utils/botLog"
import {
  discordEnv,
  resolveDiscordBotRuntimeConfig,
  type DiscordBotRuntimeMode,
  type DiscordBotShardCount,
} from "@workspace/env/discord"

import {
  shutdownDiscordBot,
  shutdownDiscordShardingManager,
  type DiscordBotShutdownReason,
} from "./shutdown"
import { assertConvexBotRuntimeConfig } from "../services/convexBotClient"

type BotClientRuntime = {
  client: Client
  start: () => Promise<void>
}

type ProcessLike = Pick<NodeJS.Process, "on" | "once">

type StartBotClientRuntimeOptions = {
  mode: DiscordBotRuntimeMode
  token?: string
  createClient?: () => BotClient
  assertRuntimeConfig?: () => void
  shutdown?: typeof shutdownDiscordBot
  processLike?: ProcessLike
  exit?: (code?: number) => void
  env?: NodeJS.ProcessEnv
}

type StartShardingManagerRuntimeOptions = {
  shardCount: DiscordBotShardCount
  token?: string
  entrypoint?: string
  createManager?: (
    file: string,
    options: ConstructorParameters<typeof ShardingManager>[1]
  ) => ShardingManager
  shutdown?: typeof shutdownDiscordShardingManager
  processLike?: ProcessLike
  exit?: (code?: number) => void
}

const defaultShardEntrypoint = fileURLToPath(
  new URL("../index.ts", import.meta.url)
)
const shutdownHandlerTargets = new WeakSet<ProcessLike>()

export async function startDiscordBotRuntimeFromEnv(): Promise<void> {
  if (isDiscordShardingWorker()) {
    await startBotClientRuntime({
      mode: "sharded",
      env: process.env,
    })
    return
  }

  const runtimeConfig = resolveDiscordBotRuntimeConfig(process.env)

  if (runtimeConfig.mode === "single") {
    await startBotClientRuntime({
      mode: "single",
      env: process.env,
    })
    return
  }

  await startShardingManagerRuntime({
    shardCount: runtimeConfig.shardCount,
  })
}

export async function startBotClientRuntime({
  mode,
  token = discordEnv.DISCORD_BOT_TOKEN,
  createClient = () => new BotClient(),
  assertRuntimeConfig = assertConvexBotRuntimeConfig,
  shutdown = shutdownDiscordBot,
  processLike = process,
  exit = process.exit,
  env = process.env,
}: StartBotClientRuntimeOptions): Promise<Client> {
  const client = createBotClientRuntime({
    token,
    createClient,
    assertRuntimeConfig,
  })

  installShutdownHandlers({
    processLike,
    shutdown(reason, exitCode, error) {
      void shutdown({
        client: client.client,
        reason,
        exitCode,
        error,
        exit,
      })
    },
  })

  try {
    botLog(formatBotClientRuntimeMessage(mode, env), "info")
    await client.start()
    return client.client
  } catch (error) {
    await shutdown({
      client: client.client,
      reason: "startupFailure",
      exitCode: 1,
      error,
      exit,
    })
    throw error
  }
}

export async function startShardingManagerRuntime({
  shardCount,
  token = discordEnv.DISCORD_BOT_TOKEN,
  entrypoint = defaultShardEntrypoint,
  createManager = (file, options) => new ShardingManager(file, options),
  shutdown = shutdownDiscordShardingManager,
  processLike = process,
  exit = process.exit,
}: StartShardingManagerRuntimeOptions): Promise<ShardingManager> {
  assertDiscordBotToken(token)

  const manager = createManager(entrypoint, {
    execArgv: ["--import", "tsx"],
    token,
    totalShards: shardCount,
    respawn: true,
  })

  manager.on("shardCreate", (shard) => logShardCreate(shard))

  installShutdownHandlers({
    processLike,
    shutdown(reason, exitCode, error) {
      void shutdown({
        manager,
        reason,
        exitCode,
        error,
        exit,
      })
    },
  })

  try {
    botLog(
      `Discord bot runtime mode: sharded (shardCount=${String(shardCount)})`,
      "info"
    )
    await manager.spawn()
    return manager
  } catch (error) {
    await shutdown({
      manager,
      reason: "startupFailure",
      exitCode: 1,
      error,
      exit,
    })
    throw error
  }
}

export function isDiscordShardingWorker(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.SHARDING_MANAGER === "true" && env.SHARDS !== undefined
}

function createBotClientRuntime({
  token,
  createClient,
  assertRuntimeConfig,
}: {
  token: string | undefined
  createClient: () => BotClient
  assertRuntimeConfig: () => void
}): BotClientRuntime {
  const client = createClient()

  return {
    client,
    async start() {
      assertRuntimeConfig()
      await client.start(token)
    },
  }
}

function installShutdownHandlers({
  processLike,
  shutdown,
}: {
  processLike: ProcessLike
  shutdown: (
    reason: DiscordBotShutdownReason,
    exitCode: number,
    error?: unknown
  ) => void
}): void {
  if (shutdownHandlerTargets.has(processLike)) {
    return
  }

  shutdownHandlerTargets.add(processLike)
  let shutdownStarted = false

  function shutdownOnce(
    reason: DiscordBotShutdownReason,
    exitCode: number,
    error?: unknown
  ): void {
    if (shutdownStarted) {
      return
    }

    shutdownStarted = true
    shutdown(reason, exitCode, error)
  }

  processLike.once("SIGINT", () => shutdownOnce("SIGINT", 0))
  processLike.once("SIGTERM", () => shutdownOnce("SIGTERM", 0))
  processLike.on("unhandledRejection", (reason) =>
    shutdownOnce("unhandledRejection", 1, reason)
  )
  processLike.on("uncaughtException", (error) =>
    shutdownOnce("uncaughtException", 1, error)
  )
}

function assertDiscordBotToken(
  token: string | undefined
): asserts token is string {
  if (!token) {
    throw new Error("Missing environment variable DISCORD_BOT_TOKEN")
  }
}

function formatBotClientRuntimeMessage(
  mode: DiscordBotRuntimeMode,
  env: NodeJS.ProcessEnv
): string {
  if (mode === "single") {
    return "Discord bot runtime mode: single"
  }

  return `Discord bot runtime mode: sharded worker (shards=${env.SHARDS ?? "unknown"}, shardCount=${env.SHARD_COUNT ?? "unknown"})`
}

function logShardCreate(shard: Shard): void {
  botLog(`Created Discord shard ${shard.id}.`, "info")
  shard.on("error", (error) => {
    botLogError("Discord shard emitted an error.", error, {
      shardId: shard.id,
    })
  })
}

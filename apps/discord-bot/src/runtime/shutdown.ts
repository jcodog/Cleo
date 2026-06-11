import type { Client } from "discord.js"

import { botLog, botLogError } from "@/utils/botLog"

export type DiscordBotShutdownReason =
  | "SIGINT"
  | "SIGTERM"
  | "startupFailure"
  | "unhandledRejection"
  | "uncaughtException"

type CleanupHook = () => Promise<void> | void

type ShutdownOptions = {
  client: Client
  reason: DiscordBotShutdownReason
  exitCode: number
  error?: unknown
  exit?: (code?: number) => void
}

const cleanupHooks = new Set<CleanupHook>()

export function registerCleanupHook(hook: CleanupHook): () => void {
  cleanupHooks.add(hook)

  return () => {
    cleanupHooks.delete(hook)
  }
}

export async function shutdownDiscordBot({
  client,
  reason,
  exitCode,
  error,
  exit = process.exit,
}: ShutdownOptions): Promise<void> {
  if (error) {
    botLogError(`Discord bot shutdown triggered: ${reason}`, error, {
      reason,
    })
  } else {
    botLog(`Discord bot shutdown requested: ${reason}`, "warn")
  }

  try {
    client.destroy()

    for (const cleanupHook of Array.from(cleanupHooks)) {
      await cleanupHook()
    }
  } catch (cleanupError) {
    botLogError("Discord bot shutdown cleanup failed.", cleanupError, {
      reason,
    })
  } finally {
    process.exitCode = exitCode
    exit(exitCode)
  }
}

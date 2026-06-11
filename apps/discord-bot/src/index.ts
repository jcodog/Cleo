import { BotClient } from "./classes/Client"
import { shutdownDiscordBot } from "./runtime/shutdown"
import { assertConvexBotRuntimeConfig } from "./services/convexBotClient"
import { discordEnv } from "@workspace/env/discord"

const client = new BotClient()
let shutdownStarted = false

function shutdownOnce(
  reason:
    | "SIGINT"
    | "SIGTERM"
    | "startupFailure"
    | "unhandledRejection"
    | "uncaughtException",
  exitCode: number,
  error?: unknown
): void {
  if (shutdownStarted) {
    return
  }

  shutdownStarted = true
  void shutdownDiscordBot({
    client,
    reason,
    exitCode,
    error,
  })
}

process.once("SIGINT", () => shutdownOnce("SIGINT", 0))
process.once("SIGTERM", () => shutdownOnce("SIGTERM", 0))
process.on("unhandledRejection", (reason) =>
  shutdownOnce("unhandledRejection", 1, reason)
)
process.on("uncaughtException", (error) =>
  shutdownOnce("uncaughtException", 1, error)
)

try {
  assertConvexBotRuntimeConfig()
  await client.start(discordEnv.DISCORD_BOT_TOKEN)
} catch (error) {
  await shutdownDiscordBot({
    client,
    reason: "startupFailure",
    exitCode: 1,
    error,
  })
}

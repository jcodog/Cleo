import { resolveTwitchRuntimeEnv } from "@workspace/env/twitch"
import { createLogger, serializeLogError } from "@workspace/logger"

import { TwitchClient } from "./classes/TwitchClient"

export async function main(): Promise<void> {
  const logger = createLogger("twitch-bot")
  const abort = new AbortController()
  const shutdown = () => abort.abort()
  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)
  try {
    const config = resolveTwitchRuntimeEnv()
    await new TwitchClient(config, logger).run(abort.signal)
  } catch (error) {
    logger.error(
      "Twitch startup or runtime failed. Check configuration and readiness.",
      { error: serializeLogError(error) }
    )
    process.exitCode = 1
  } finally {
    process.removeListener("SIGTERM", shutdown)
    process.removeListener("SIGINT", shutdown)
  }
}

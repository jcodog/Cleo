import { resolveTwitchRuntimeEnv } from "@workspace/env/twitch"
import { createLogger } from "@workspace/logger"

import { TwitchApi } from "./api"
import { GrantStore } from "./grantStore"
import { runRuntime } from "./runtime"

export async function main(): Promise<void> {
  const logger = createLogger("twitch-bot")
  const abort = new AbortController()
  const shutdown = () => abort.abort()
  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)
  try {
    const config = resolveTwitchRuntimeEnv()
    await runRuntime(config, {
      createApi: (signal) => new TwitchApi(config, fetch, signal),
      store: new GrantStore(config.TWITCH_BOT_GRANT_PATH),
      logger,
      signal: abort.signal,
    })
  } catch {
    logger.error(
      "Twitch startup or runtime failed. Check configuration and readiness."
    )
    process.exitCode = 1
  } finally {
    process.removeListener("SIGTERM", shutdown)
    process.removeListener("SIGINT", shutdown)
  }
}

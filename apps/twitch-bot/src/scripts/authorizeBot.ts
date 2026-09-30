import { resolveTwitchOperatorEnv } from "@workspace/env/twitch"
import { createLogger } from "@workspace/logger"

import { TwitchApi } from "../api"
import { authorizeBot } from "../authorization"
import { GrantStore } from "../grantStore"

export async function main(): Promise<void> {
  const logger = createLogger("twitch-bot-authorization")
  try {
    const config = resolveTwitchOperatorEnv()
    await authorizeBot(config, {
      api: new TwitchApi(config),
      store: new GrantStore(config.TWITCH_BOT_GRANT_PATH),
      showUrl: (url) =>
        logger.info("Open this URL while signed in as the dedicated Cleo bot", {
          url,
        }),
    })
    logger.info(
      "Verified bot grant saved privately. Transfer it through your secure operator channel; tokens are not printed."
    )
  } catch {
    logger.error(
      "Bot authorization failed. Check the expected account, scopes, redirect URI and private output directory. Existing grants are never overwritten."
    )
    process.exitCode = 1
  }
}

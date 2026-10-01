import { resolveTwitchOperatorEnv } from "@workspace/env/twitch"
import { createLogger, serializeLogError } from "@workspace/logger"

import { TwitchApi } from "../api"
import { authorizeBot } from "../authorization"
import { GrantStore } from "../grantStore"

export async function main(): Promise<void> {
  const logger = createLogger("twitch-bot-authorization")
  try {
    const config = resolveTwitchOperatorEnv()
    if (!process.stdout.isTTY)
      throw new Error(
        "Bot authorization requires an interactive operator terminal."
      )
    await authorizeBot(config, {
      api: new TwitchApi(config),
      store: new GrantStore(config.TWITCH_BOT_GRANT_PATH),
      showUrl: (url) => {
        process.stdout.write(
          `Open this URL while signed in as the dedicated Cleo bot:\n${url}\n`
        )
      },
    })
    logger.info(
      "Verified bot grant saved privately. Transfer it through your secure operator channel; tokens are not printed."
    )
  } catch (error) {
    logger.error(
      "Bot authorization failed. Check the expected account, scopes, redirect URI and private output directory. Existing grants are never overwritten.",
      { error: serializeLogError(error) }
    )
    process.exitCode = 1
  }
}

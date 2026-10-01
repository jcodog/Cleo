import { resolveTwitchRuntimeEnv } from "@workspace/env/twitch"
import { createLogger } from "@workspace/logger"

import { TwitchApiService } from "../services/TwitchApiService"
import { ensureBotGrant, GrantStore } from "../auth/grantStore"

export async function sendSmokeMessage(
  env: Record<string, string | undefined>,
  message = "dude is online.",
  requestFetch: typeof fetch = fetch
): Promise<string> {
  const config = resolveTwitchRuntimeEnv(env)
  if (!config.TWITCH_BOOTSTRAP_BROADCASTER_USER_ID)
    throw new Error("An explicit smoke broadcaster is required.")
  const api = new TwitchApiService(config, requestFetch)
  const botUserToken = await ensureBotGrant(
    api,
    new GrantStore(config.TWITCH_BOT_GRANT_PATH),
    config
  )
  const appToken = await api.acquireAppToken()
  await api.broadcasterExists(
    appToken,
    config.TWITCH_BOOTSTRAP_BROADCASTER_USER_ID
  )
  return api.sendChatMessage(
    botUserToken,
    config.TWITCH_BOOTSTRAP_BROADCASTER_USER_ID,
    message
  )
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const logger = createLogger("twitch-smoke")
  try {
    if (args.length > 1)
      throw new Error("Expected at most one message argument.")
    const messageId = await sendSmokeMessage(process.env, args[0])
    logger.info("Explicit Twitch smoke message sent", { messageId })
  } catch {
    logger.error("Twitch smoke failed. No automatic retry was attempted.")
    process.exitCode = 1
  }
}

import { backendEnv } from "@workspace/env/backend"

type TwitchControlPlaneEnv = Pick<
  typeof backendEnv,
  | "TWITCH_CLIENT_ID"
  | "TWITCH_CLIENT_SECRET"
  | "TWITCH_BOT_USER_ID"
  | "TWITCH_EVENTSUB_CALLBACK_URL"
  | "TWITCH_EVENTSUB_SECRET"
  | "TWITCH_WORKER_SECRET"
>

// Server-only configuration. Callers expose availability, never these values.
export function readTwitchControlPlaneConfig(
  env: TwitchControlPlaneEnv = backendEnv
) {
  const {
    TWITCH_CLIENT_ID: clientId,
    TWITCH_CLIENT_SECRET: clientSecret,
    TWITCH_BOT_USER_ID: botId,
    TWITCH_EVENTSUB_CALLBACK_URL: callback,
    TWITCH_EVENTSUB_SECRET: secret,
    TWITCH_WORKER_SECRET: workerSecret,
  } = env
  if (
    !clientId?.trim() ||
    !clientSecret?.trim() ||
    !botId?.trim() ||
    !callback?.trim() ||
    !secret?.trim() ||
    !workerSecret?.trim()
  )
    return null
  return { clientId, clientSecret, botId, callback, secret }
}

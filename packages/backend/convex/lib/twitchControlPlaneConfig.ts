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
    !isConfiguredValue(clientId) ||
    !isConfiguredValue(clientSecret) ||
    !isConfiguredValue(botId) ||
    !isConfiguredValue(callback) ||
    !isConfiguredValue(secret) ||
    !isConfiguredValue(workerSecret)
  )
    return null
  return { clientId, clientSecret, botId, callback, secret }
}

function isConfiguredValue(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim()
}

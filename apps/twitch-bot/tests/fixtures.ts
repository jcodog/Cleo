import { chmod, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveTwitchRuntimeEnv } from "@workspace/env/twitch"
import type { Logger } from "@workspace/logger"
import { BOT_SCOPES, type BotToken } from "../src/api"
import { GrantStore } from "../src/grantStore"

export const apiConfig = {
  NODE_ENV: "test",
  TWITCH_CLIENT_ID: "test-client",
  TWITCH_CLIENT_SECRET: "test-only-secret",
  TWITCH_BOT_USER_ID: "111",
  TWITCH_BOT_GRANT_PATH: "/private/test.twitch-grant.json",
  TWITCH_HTTP_TIMEOUT_MS: 1000,
} as const
export const validBot = {
  client_id: "test-client",
  user_id: "111",
  scopes: [...BOT_SCOPES],
  expires_in: 1000,
}
export const validApp = {
  client_id: "test-client",
  scopes: null,
  expires_in: 1000,
}
export const botToken: BotToken = {
  access_token: "test-only-access",
  refresh_token: "test-only-refresh",
  scope: [...BOT_SCOPES],
  expires_in: 1000,
  token_type: "bearer",
}
export const subscription = {
  id: "test-sub",
  type: "channel.chat.message",
  version: "1",
  status: "enabled",
  condition: { broadcaster_user_id: "222", user_id: "111" },
  transport: {
    method: "webhook",
    callback: "https://test.convex.site/twitch-eventsub",
  },
}
export const desiredSubscription = {
  broadcasterId: "222",
  botId: "111",
  callback: subscription.transport.callback,
  secret: "test-only-eventsub-secret",
}

export function httpFake(
  handle: (url: URL, init: RequestInit) => Response | Promise<Response>
): typeof fetch {
  return async (input, init) => handle(new URL(String(input)), init ?? {})
}
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status })

export async function withGrant<T>(
  run: (store: GrantStore, directory: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "cleo-twitch-test-"))
  await chmod(directory, 0o700)
  try {
    return await run(
      new GrantStore(join(directory, "bot.twitch-grant.json"), 2000),
      directory
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
}
export function runtimeEnv(
  grantPath: string,
  statePath = "/private/test.twitch-readiness.json"
) {
  return resolveTwitchRuntimeEnv({
    ...apiConfig,
    TWITCH_HTTP_TIMEOUT_MS: "1000",
    TWITCH_STARTUP_TIMEOUT_MS: "1000",
    TWITCH_BOT_GRANT_PATH: grantPath,
    TWITCH_READINESS_PATH: statePath,
    TWITCH_BOOTSTRAP_BROADCASTER_USER_ID: "222",
    TWITCH_EVENTSUB_CALLBACK_URL: subscription.transport.callback,
    TWITCH_EVENTSUB_SECRET: "test-only-eventsub-secret",
  })
}

export function runtimeHttp(
  options: {
    subscriptions?: unknown[]
    broadcaster?: boolean
    botStatus?: number
    listStatus?: number
    onSend?: () => void
  } = {}
): typeof fetch {
  return httpFake((url, init) => {
    if (url.pathname.endsWith("validate"))
      return new Headers(init.headers).get("Authorization") ===
        "OAuth test-only-access"
        ? json(validBot, options.botStatus)
        : json(validApp)
    if (url.pathname.endsWith("token"))
      return json({
        access_token: "test-only-app",
        expires_in: 1000,
        token_type: "bearer",
      })
    if (url.pathname.endsWith("users"))
      return json({
        data: options.broadcaster === false ? [] : [{ id: "222" }],
      })
    if (url.pathname.endsWith("subscriptions"))
      return json(
        { data: options.subscriptions ?? [subscription] },
        options.listStatus
      )
    options.onSend?.()
    throw new Error("Runtime must never send a chat message.")
  })
}

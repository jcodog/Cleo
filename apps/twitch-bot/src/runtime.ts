import { setTimeout as delay } from "node:timers/promises"

import type { TwitchRuntimeEnv } from "@workspace/env/twitch"
import type { Logger } from "@workspace/logger"

import { TwitchApi, TwitchFailure } from "./api"
import { ensureBotGrant, GrantStore } from "./grantStore"
import { writeReadiness, type ReadinessState } from "./readiness"
import { reconcileChatSubscription } from "./subscriptions"

export type RuntimeDependencies = {
  createApi: (signal: AbortSignal) => TwitchApi
  store: GrantStore
  logger: Logger
  signal: AbortSignal
  writeState?: typeof writeReadiness
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  now?: () => number
  pid?: number
}

export async function runRuntime(
  config: TwitchRuntimeEnv,
  dependencies: RuntimeDependencies
): Promise<void> {
  const { store, logger, signal } = dependencies
  const now = dependencies.now ?? Date.now
  const sleep =
    dependencies.sleep ??
    (async (milliseconds, abort) => {
      await delay(milliseconds, undefined, { signal: abort })
    })
  const persist = dependencies.writeState ?? writeReadiness
  const startedAt = now()
  const deadline = new AbortController()
  const startupTimer = setTimeout(
    () => deadline.abort(),
    config.TWITCH_STARTUP_TIMEOUT_MS
  )
  const operationSignal = AbortSignal.any([signal, deadline.signal])
  const api = dependencies.createApi(operationSignal)
  const identity = {
    version: 1,
    pid: dependencies.pid ?? process.pid,
    startedAt,
  } as const
  const state = (value: ReadinessState["state"], subscriptionId?: string) =>
    persist(config.TWITCH_READINESS_PATH, {
      ...identity,
      updatedAt: now(),
      state: value,
      ...(subscriptionId ? { subscriptionId } : {}),
    })
  let appToken: string | undefined
  let ready = false
  try {
    await state("starting")
    while (!signal.aborted) {
      await ensureBotGrant(api, store, config)
      if (!appToken) appToken = await api.acquireAppToken()
      else {
        try {
          await api.validateAppToken(appToken)
        } catch (error) {
          if (!(
            error instanceof TwitchFailure &&
            (error.code === "unauthorized" || error.code === "expiredToken")
          ))
            throw error
          appToken = await api.acquireAppToken()
        }
      }
      await api.broadcasterExists(
        appToken,
        config.TWITCH_BOOTSTRAP_BROADCASTER_USER_ID
      )
      const subscription = await reconcileChatSubscription(api, appToken, {
        broadcasterId: config.TWITCH_BOOTSTRAP_BROADCASTER_USER_ID,
        botId: config.TWITCH_BOT_USER_ID,
        callback: config.TWITCH_EVENTSUB_CALLBACK_URL,
        secret: config.TWITCH_EVENTSUB_SECRET,
      })
      if (!ready && now() - startedAt >= config.TWITCH_STARTUP_TIMEOUT_MS)
        throw new TwitchFailure("startupTimeout")
      if (subscription.status === "ready") {
        clearTimeout(startupTimer)
        await state("ready", subscription.subscriptionId)
        if (!ready)
          logger.info("Twitch runtime ready", {
            subscriptionId: subscription.subscriptionId,
          })
        ready = true
      } else {
        await state("starting")
        if (ready || now() - startedAt >= config.TWITCH_STARTUP_TIMEOUT_MS)
          throw new TwitchFailure("subscriptionUnavailable")
      }
      await sleep(ready ? 30000 : 2000, operationSignal)
    }
  } catch (error) {
    if (!signal.aborted) {
      await state("unhealthy")
      logger.error("Twitch runtime unhealthy", {
        code:
          error instanceof TwitchFailure ? error.code : "localStateUnavailable",
      })
      throw deadline.signal.aborted
        ? new TwitchFailure("startupTimeout")
        : error
    }
  } finally {
    clearTimeout(startupTimer)
    if (signal.aborted) {
      await state("stopped")
      logger.info("Twitch runtime stopped")
    }
  }
}

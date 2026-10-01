import { setTimeout as delay } from "node:timers/promises"
import type { TwitchRuntimeEnv } from "@workspace/env/twitch"
import type { Logger } from "@workspace/logger"
import { TwitchApiService } from "../services/TwitchApiService"
import { TwitchAuthService } from "../services/TwitchAuthService"
import { ConvexService } from "../services/ConvexService"
import { AnnouncementService } from "../services/announcements/AnnouncementService"
import { EventSubRouter } from "../services/eventsub/EventSubRouter"
import { TwitchWebhookServer } from "../services/eventsub/TwitchWebhookServer"
import { GrantStore } from "../auth/grantStore"
import { writeReadiness } from "../runtime/readiness"
import { serializeLogError } from "@workspace/logger"

export class TwitchClient {
  readonly auth: TwitchAuthService
  readonly webhook: TwitchWebhookServer
  private readonly shutdown = new AbortController()
  constructor(
    private readonly config: TwitchRuntimeEnv,
    private readonly logger: Logger,
    request: typeof fetch = fetch
  ) {
    const api = new TwitchApiService(config, request, this.shutdown.signal)
    this.auth = new TwitchAuthService(
      api,
      new GrantStore(config.TWITCH_BOT_GRANT_PATH),
      config
    )
    const convex = new ConvexService(
      config.CONVEX_URL,
      config.TWITCH_WORKER_SECRET,
      request,
      this.shutdown.signal
    )
    const announcements = new AnnouncementService(api, this.auth, logger)
    const router = new EventSubRouter({ convex, announcements }, logger)
    this.webhook = new TwitchWebhookServer(
      config.TWITCH_EVENTSUB_SECRET,
      convex,
      router,
      logger
    )
  }
  async run(signal: AbortSignal): Promise<void> {
    const abort = () => this.shutdown.abort()
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    const identity = {
      version: 1 as const,
      pid: process.pid,
      startedAt: Date.now(),
    }
    const state = (state: "starting" | "ready" | "unhealthy" | "stopped") =>
      writeReadiness(this.config.TWITCH_READINESS_PATH, {
        ...identity,
        state,
        updatedAt: Date.now(),
      })
    try {
      await state("starting")
      await this.auth.maintain()
      await this.webhook.start(this.config.TWITCH_WEBHOOK_PORT)
      await this.webhook.recoverPending()
      await state("ready")
      this.logger.info("Twitch runtime ready")
      while (!signal.aborted) {
        // Token maintenance and local readiness only. No subscription lifecycle work.
        await delay(30000, undefined, { signal })
        await this.auth.maintain()
        if (!this.webhook.isListening)
          throw new Error("Twitch webhook listener unavailable.")
        await state("ready")
      }
    } catch (error) {
      if (!signal.aborted) {
        await state("unhealthy").catch((failure) =>
          this.logger.error("Readiness update failed", {
            error: serializeLogError(failure),
          })
        )
        throw error
      }
    } finally {
      await this.webhook
        .stop()
        .catch((failure) =>
          this.logger.error("Webhook shutdown failed", {
            error: serializeLogError(failure),
          })
        )
      if (signal.aborted) {
        await state("stopped").catch((failure) =>
          this.logger.error("Readiness update failed", {
            error: serializeLogError(failure),
          })
        )
        this.logger.info("Twitch runtime stopped")
      }
      signal.removeEventListener("abort", abort)
    }
  }
}

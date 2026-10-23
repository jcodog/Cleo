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
import { ChatActivity } from "../services/timers/ChatActivity"
import { TimerScheduler } from "../services/timers/TimerScheduler"
import { ModerationRuntime } from "@workspace/shared/moderationRuntime"
import { randomUUID } from "node:crypto"
import { eventDefinitions } from "@workspace/shared/twitchEventSub"

export class TwitchClient {
  readonly auth: TwitchAuthService
  readonly webhook: TwitchWebhookServer
  private readonly convex: ConvexService
  private readonly shutdown = new AbortController()
  private readonly timers: TimerScheduler
  private readonly moderation: ModerationRuntime
  constructor(
    private readonly config: TwitchRuntimeEnv,
    private readonly logger: Logger,
    request: typeof fetch = fetch
  ) {
    const api = new TwitchApiService(
      config,
      request,
      this.shutdown.signal,
      30_000
    )
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
    this.convex = convex
    const announcements = new AnnouncementService(api, this.auth, logger)
    const activity = new ChatActivity(config.TWITCH_BOT_USER_ID)
    this.timers = new TimerScheduler(
      convex,
      api,
      this.auth,
      activity,
      logger,
      this.shutdown.signal
    )
    const worker = randomUUID()
    this.moderation = new ModerationRuntime((scope) =>
      convex.moderationPolicy(scope, worker)
    )
    const router = new EventSubRouter(
      {
        convex,
        announcements,
        moderation: async (event) => {
          const parsed = eventDefinitions.chatMessage.parse(event)
          if (parsed.chatter_user_id === config.TWITCH_BOT_USER_ID) return
          await this.moderation.load(
            parsed.broadcaster_user_id,
            Math.floor(performance.now())
          )
          let offset = 0
          const emotes: { start: number; end: number }[] = []
          for (const fragment of parsed.message.fragments ?? []) {
            if (fragment.type === "emote")
              emotes.push({ start: offset, end: offset + fragment.text.length })
            offset += fragment.text.length
          }
          if (
            parsed.message.fragments &&
            parsed.message.fragments.map((f) => f.text).join("") !==
              parsed.message.text
          )
            return
          const result = this.moderation.inspect(
            {
              id: parsed.message_id,
              scopeId: parsed.broadcaster_user_id,
              authorId: parsed.chatter_user_id,
              content: parsed.message.text,
              emotes,
              roleIds: (parsed.badges ?? []).map((badge) => badge.set_id),
              isAdministrator:
                parsed.chatter_user_id === parsed.broadcaster_user_id,
              isModerator: (parsed.badges ?? []).some(
                (b) => b.set_id === "moderator"
              ),
            },
            Math.floor(performance.now())
          )
          if (!result?.decision.matched) return
          logger.info("Twitch moderation matched", {
            rules: result.decision.ruleIds,
          })
          if (
            !parsed.badges ||
            !parsed.message.fragments ||
            !result.enforce ||
            config.TWITCH_MODERATION_ENFORCEMENT_ENABLED !== "true" ||
            result.decision.proposedAction.kind === "none" ||
            result.decision.proposedAction.kind === "log"
          )
            return
          await convex
            .moderate(
              parsed.broadcaster_user_id,
              worker,
              result.decision.policyRevision,
              parsed.chatter_user_id,
              parsed.message_id,
              JSON.stringify(result.decision.proposedAction)
            )
            .catch(() =>
              logger.warn(
                "Twitch moderation permission or connection unavailable"
              )
            )
        },
      },
      logger
    )
    this.webhook = new TwitchWebhookServer(
      config.TWITCH_EVENTSUB_SECRET,
      convex,
      router,
      logger,
      activity,
      config.TWITCH_BOT_USER_ID,
      (id, online, eventAt) => this.timers.lifecycle(id, online, eventAt)
    )
  }
  async run(signal: AbortSignal): Promise<void> {
    let abortDeadline: ReturnType<typeof setTimeout> | undefined
    const abort = () => {
      this.timers.stopAccepting()
      this.webhook.stopAccepting()
      // Also bound startup recovery when SIGTERM arrives during its cooldown.
      abortDeadline = setTimeout(() => this.shutdown.abort(), 15_000)
    }
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
      await this.reportReadiness()
      this.timers.start()
      this.logger.info("Twitch runtime ready")
      while (!signal.aborted) {
        // Token maintenance and readiness reporting. No subscription lifecycle work.
        await delay(30000, undefined, { signal })
        await this.auth.maintain()
        await this.moderation.refresh(Math.floor(performance.now()))
        if (!this.webhook.isListening)
          throw new Error("Twitch webhook listener unavailable.")
        await state("ready")
        await this.reportReadiness()
        // Only pre-send durable receipts are recoverable. Retry them after
        // congestion without requiring another restart or EventSub redelivery.
        void this.webhook
          .recoverPending()
          .catch(() => this.logger.warn("Event recovery unavailable"))
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
      this.timers.stopAccepting()
      let grace: ReturnType<typeof setTimeout> | undefined
      const drain = Promise.allSettled([
        this.timers.stop(),
        this.webhook.stop().catch((failure) =>
          this.logger.error("Webhook shutdown failed", {
            error: serializeLogError(failure),
          })
        ),
      ])
      await Promise.race([
        drain,
        new Promise<void>((resolve) => {
          grace = setTimeout(resolve, 15_000)
        }),
      ])
      clearTimeout(grace)
      this.shutdown.abort()
      clearTimeout(abortDeadline)
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
  private async reportReadiness(): Promise<void> {
    // Compatible with a runtime-first rollout and temporary control-plane outages.
    await this.convex
      .reportReadiness(
        this.config.TWITCH_CLIENT_ID,
        this.config.TWITCH_BOT_USER_ID
      )
      .catch(() =>
        this.logger.warn("Twitch control-plane readiness unavailable")
      )
  }
}

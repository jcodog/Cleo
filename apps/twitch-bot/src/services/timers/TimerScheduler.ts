import {
  TIMER_REFRESH_MS,
  TIMER_CONFIG_TTL_MS,
  timerDeadline,
  type TimerRuntimeGroup,
} from "@workspace/shared/twitchTimers"
import type { Logger } from "@workspace/logger"
import type { ConvexService } from "../ConvexService"
import type { TwitchApiService } from "../TwitchApiService"
import type { TwitchAuthService } from "../TwitchAuthService"
import { ChatBackpressure } from "../ChatSendQueue"
import { ChatActivity } from "./ChatActivity"

type Entry = {
  group: TimerRuntimeGroup
  baseline: number
  dueAt: number
  diagnostic?: string
  diagnosedAt: number
}
export class TimerScheduler {
  private readonly groups = new Map<string, Entry>()
  private watermark?: number
  private refreshedAt = 0
  private refreshAt = 0
  private timer?: ReturnType<typeof setTimeout>
  private work?: Promise<void>
  private stopped = false
  constructor(
    private readonly convex: Pick<
      ConvexService,
      "timerPage" | "claimTimer" | "settleTimer" | "diagnoseTimer"
    >,
    private readonly api: Pick<
      TwitchApiService,
      "liveBroadcasters" | "sendChatMessage"
    >,
    private readonly auth: Pick<TwitchAuthService, "appToken">,
    readonly activity: ChatActivity,
    private readonly logger: Logger,
    private readonly signal: AbortSignal,
    private readonly now = Date.now
  ) {}
  start(): void {
    this.schedule(0)
  }
  private schedule(ms: number): void {
    if (this.stopped || this.signal.aborted) return
    this.timer = setTimeout(() => {
      this.work = this.tick()
        .catch(() => this.logger.warn("Timer scheduler unavailable"))
        .finally(() => {
          const now = this.now()
          const next = Math.min(
            this.refreshAt,
            ...[...this.groups.values()].map((g) => g.dueAt)
          )
          this.schedule(Math.max(100, Math.min(TIMER_REFRESH_MS, next - now)))
        })
    }, ms)
    this.timer.unref()
  }
  async tick(): Promise<void> {
    if (this.stopped || this.signal.aborted) return
    const now = this.now()
    if (now >= this.refreshAt) {
      this.refreshAt = now + TIMER_REFRESH_MS
      try {
        await this.refresh()
      } catch {
        this.logger.warn("Timer configuration refresh unavailable")
      }
    }
    if (
      !this.refreshedAt ||
      this.now() - this.refreshedAt > TIMER_CONFIG_TTL_MS
    )
      return
    // Map insertion order rotates after each batch so busy broadcasters cannot
    // monopolize due work. Provider calls remain bounded to four groups.
    const due = [...this.groups.values()]
      .filter((e) => e.dueAt <= this.now())
      .slice(0, 4)
    const active: Entry[] = []
    for (const entry of due) {
      this.groups.delete(entry.group.id)
      this.groups.set(entry.group.id, entry)
      entry.dueAt = this.now() + TIMER_REFRESH_MS
      if (
        !this.activity.eligible(
          entry.group.broadcasterId,
          entry.baseline,
          entry.group.minimumMessages,
          this.now()
        )
      ) {
        await this.diagnose(entry, "waitingForActivity")
      } else active.push(entry)
    }
    if (!active.length) return
    try {
      const token = await this.auth.appToken()
      const live = await this.api.liveBroadcasters(token, [
        ...new Set(active.map((e) => e.group.broadcasterId)),
      ])
      await Promise.all(
        active.map(async (entry) => {
          if (!live.has(entry.group.broadcasterId)) {
            await this.diagnose(entry, "waitingForStream")
            return
          }
          await this.send(entry, token)
        })
      )
    } catch {
      await Promise.all(
        active.map((entry) => this.diagnose(entry, "providerUnavailable"))
      )
    }
  }
  private async refresh(): Promise<void> {
    const changes: TimerRuntimeGroup[] = []
    let cursor: string | undefined
    let startedAt: number | undefined
    do {
      const page = await this.convex.timerPage(this.watermark, cursor)
      startedAt ??= page.startedAt
      changes.push(...page.groups)
      if (changes.length > 10_000)
        throw new Error("Timer configuration capacity exceeded.")
      cursor = page.cursor ?? undefined
    } while (cursor && !this.signal.aborted)
    if (this.signal.aborted) return
    const now = this.now()
    for (const group of changes) {
      if (!group.enabled || !group.messages.length) {
        this.groups.delete(group.id)
        continue
      }
      const previous = this.groups.get(group.id)
      if (previous && previous.group.revision === group.revision) {
        if ((group.lastSentAt ?? 0) > (previous.group.lastSentAt ?? 0)) {
          previous.group.cursor = group.cursor
          previous.group.lastSentAt = group.lastSentAt
          previous.baseline = this.activity.snapshot(group.broadcasterId).count
        }
        if ((group.lastAttemptAt ?? 0) > (previous.group.lastAttemptAt ?? 0)) {
          previous.group.lastAttemptAt = group.lastAttemptAt
          previous.dueAt = Math.max(
            previous.dueAt,
            group.lastAttemptAt! + group.intervalMinutes * 60_000
          )
        }
        continue
      }
      if (!previous && this.groups.size >= 10_000)
        throw new Error("Timer configuration capacity exceeded.")
      this.groups.set(group.id, {
        group,
        baseline: this.activity.snapshot(group.broadcasterId).count,
        dueAt: timerDeadline(group, now),
        diagnosedAt: 0,
      })
    }
    this.activity.watch(
      [...this.groups.values()].map((e) => e.group.broadcasterId)
    )
    this.watermark = startedAt
    this.refreshedAt = now
  }
  private async send(entry: Entry, token: string): Promise<void> {
    const group = entry.group
    let execution: Awaited<ReturnType<ConvexService["claimTimer"]>> = null
    try {
      const sent = await this.api.sendChatMessage(
        token,
        group.broadcasterId,
        group.messages[group.cursor % group.messages.length]!,
        async () => {
          if (
            this.stopped ||
            this.signal.aborted ||
            this.now() - this.refreshedAt > TIMER_CONFIG_TTL_MS ||
            !this.activity.eligible(
              group.broadcasterId,
              entry.baseline,
              group.minimumMessages,
              this.now()
            )
          )
            return false
          // Repeat the live check after queueing. A failed GET never means live.
          if (
            !(
              await this.api.liveBroadcasters(token, [group.broadcasterId])
            ).has(group.broadcasterId)
          )
            return false
          execution = await this.convex.claimTimer(group.id, group.revision)
          if (!execution) return false
          group.lastAttemptAt = this.now()
          entry.dueAt = this.now() + group.intervalMinutes * 60_000
          return (
            execution.expiresAt > this.now() &&
            execution.message ===
              group.messages[group.cursor % group.messages.length]
          )
        }
      )
      if (sent && execution) {
        const confirmed = execution as { executionId: string }
        await this.convex.settleTimer(group.id, confirmed.executionId, true)
        group.cursor = (group.cursor + 1) % group.messages.length
        group.lastSentAt = this.now()
        entry.dueAt = this.now() + group.intervalMinutes * 60_000
        entry.baseline = this.activity.snapshot(group.broadcasterId).count
        entry.diagnostic = "ready"
      } else if (execution) {
        const suppressed = execution as { executionId: string }
        await this.convex.settleTimer(group.id, suppressed.executionId, false)
      }
    } catch (error) {
      if (execution) {
        const uncertain = execution as { executionId: string }
        await this.convex
          .settleTimer(group.id, uncertain.executionId, false)
          .catch(() => {})
      } else
        await this.diagnose(
          entry,
          error instanceof ChatBackpressure
            ? "rateLimited"
            : "providerUnavailable"
        )
    }
  }
  private async diagnose(
    entry: Entry,
    state: Parameters<ConvexService["diagnoseTimer"]>[2]
  ): Promise<void> {
    if (entry.diagnostic === state && this.now() - entry.diagnosedAt < 60_000)
      return
    await this.convex
      .diagnoseTimer(entry.group.id, entry.group.revision, state)
      .then(() => {
        entry.diagnostic = state
        entry.diagnosedAt = this.now()
      })
      .catch(() => {})
  }
  async stop(): Promise<void> {
    this.stopped = true
    clearTimeout(this.timer)
    await this.work
    this.activity.clear()
    this.groups.clear()
  }
}

import {
  TIMER_REFRESH_MS,
  TIMER_CONFIG_TTL_MS,
  timerDeadline,
  timerMessage,
  type TimerRuntimeGroup,
} from "@workspace/shared/twitchTimers"
import type { Logger } from "@workspace/logger"
import type { ConvexService } from "../ConvexService"
import type { TwitchApiService } from "../TwitchApiService"
import type { TwitchAuthService } from "../TwitchAuthService"
import { ChatBackpressure } from "../ChatSendQueue"
import { TwitchFailure } from "../TwitchApiService"
import { ChatActivity } from "./ChatActivity"

type Entry = {
  group: TimerRuntimeGroup
  baseline: number
  dueAt: number
  diagnostic?: string
  diagnosedAt: number
}
type Session = {
  id: string
  startedAt: number
  activatedAt: number
  observedAt: number
}
type Settlement = {
  entry: Entry
  executionId: string
  sent: boolean
  definite: boolean
  state: Parameters<ConvexService["diagnoseTimer"]>[2]
  retryAt: number
}
const RECONCILE_MS = 5 * 60_000
const PREPARED_FRESH_MS = 2_000

export class TimerScheduler {
  private readonly groups = new Map<string, Entry>()
  private readonly activeGroups = new Map<string, Entry>()
  private readonly broadcasters = new Map<string, Entry[]>()
  private readonly sessions = new Map<string, Session>()
  private readonly generations = new Map<string, number>()
  private readonly events = new Map<string, number>()
  private readonly settlements = new Map<string, Settlement>()
  private readonly lifecycleWork = new Set<Promise<void>>()
  private watermark?: number
  private refreshedAt = 0
  private refreshAt = 0
  private reconcileAt = 0
  private timer?: ReturnType<typeof setTimeout>
  private work?: Promise<void>
  private stopped = false
  constructor(
    private readonly convex: Pick<
      ConvexService,
      | "timerPage"
      | "claimTimer"
      | "beginTimer"
      | "settleTimer"
      | "diagnoseTimer"
      | "timerSession"
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
        .finally(() => this.schedule(TIMER_REFRESH_MS))
    }, ms)
    this.timer.unref()
  }
  // The listener verifies HMAC, schema and event time before calling this.
  lifecycle(
    broadcasterId: string,
    online: boolean,
    eventAt: number
  ): Promise<void> {
    if (
      this.stopped ||
      !this.hasBroadcaster(broadcasterId) ||
      eventAt > this.now() ||
      eventAt <= (this.events.get(broadcasterId) ?? 0) ||
      eventAt < (this.sessions.get(broadcasterId)?.observedAt ?? 0)
    )
      return Promise.resolve()
    this.events.set(broadcasterId, eventAt)
    this.generations.set(
      broadcasterId,
      (this.generations.get(broadcasterId) ?? 0) + 1
    )
    if (!online) this.deactivate(broadcasterId)
    const work = (
      online
        ? this.reconcile([broadcasterId], eventAt)
        : this.convex
            .timerSession(broadcasterId, this.now(), undefined, eventAt)
            .then(() => {})
    )
      .catch(() => {
        this.deactivate(broadcasterId)
        this.logger.warn("Timer stream lifecycle unavailable")
      })
      .finally(() => this.lifecycleWork.delete(work))
    this.lifecycleWork.add(work)
    return work
  }
  private hasBroadcaster(id: string): boolean {
    return this.broadcasters.has(id)
  }
  private watch(): void {
    this.activity.watch(this.sessions.keys())
  }
  private deactivate(id: string): void {
    this.sessions.delete(id)
    for (const entry of this.broadcasters.get(id) ?? [])
      this.activeGroups.delete(entry.group.id)
    this.watch()
  }
  private async reconcile(ids: string[], eventAt?: number): Promise<void> {
    if (!ids.length) return
    const generations = new Map(ids.map((id) => [id, this.generations.get(id)]))
    const token = await this.auth.appToken()
    for (let offset = 0; offset < ids.length && !this.stopped; offset += 100) {
      const batch = ids.slice(offset, offset + 100)
      const observedAt = this.now()
      const live = await this.api.liveBroadcasters(token, batch)
      for (const id of batch) {
        if (
          this.stopped ||
          generations.get(id) !== this.generations.get(id) ||
          !this.hasBroadcaster(id)
        )
          continue
        const stream = live.get(id)
        if (!(await this.convex.timerSession(id, observedAt, stream, eventAt)))
          continue
        if (this.stopped || generations.get(id) !== this.generations.get(id))
          continue
        const previous = this.sessions.get(id)
        if (!stream) {
          this.deactivate(id)
          continue
        }
        if (previous?.id === stream.id) {
          previous.observedAt = observedAt
          continue
        }
        const session = { ...stream, activatedAt: this.now(), observedAt }
        this.sessions.set(id, session)
        this.watch()
        this.activity.reset(id, session.activatedAt)
        for (const entry of this.broadcasters.get(id)!) {
          if (entry.group.streamId !== stream.id) {
            entry.group.cursor = 0
            entry.group.lastSentAt = undefined
            entry.group.lastAttemptAt = undefined
          }
          entry.group.streamId = stream.id
          entry.group.sessionStartedAt = stream.startedAt
          entry.group.sessionLive = true
          entry.baseline = 0
          entry.dueAt = timerDeadline(entry.group, session.activatedAt)
          this.activeGroups.set(entry.group.id, entry)
        }
      }
    }
  }
  async tick(): Promise<void> {
    if (this.stopped || this.signal.aborted) return
    if (this.now() >= this.refreshAt) {
      this.refreshAt = this.now() + TIMER_REFRESH_MS
      try {
        await this.refresh()
      } catch {
        this.logger.warn("Timer configuration refresh unavailable")
      }
    }
    await this.retrySettlements()
    if (
      !this.refreshedAt ||
      this.now() - this.refreshedAt > TIMER_CONFIG_TTL_MS
    )
      return
    if (this.now() >= this.reconcileAt) {
      this.reconcileAt = this.now() + RECONCILE_MS
      try {
        await this.reconcile([...this.broadcasters.keys()])
      } catch {
        this.logger.warn("Timer stream reconciliation unavailable")
      }
    }
    const selected = new Set<string>()
    const due = [...this.activeGroups.values()]
      .filter((e) => {
        if (e.dueAt > this.now() || selected.has(e.group.broadcasterId))
          return false
        selected.add(e.group.broadcasterId)
        return true
      })
      .slice(0, 4)
    await Promise.all(
      due.map(async (entry) => {
        this.groups.delete(entry.group.id)
        this.groups.set(entry.group.id, entry)
        this.activeGroups.delete(entry.group.id)
        this.activeGroups.set(entry.group.id, entry)
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
          return
        }
        await this.send(entry)
      })
    )
  }
  private async refresh(): Promise<void> {
    const changes: TimerRuntimeGroup[] = []
    let cursor: string | undefined, startedAt: number | undefined
    do {
      const page = await this.convex.timerPage(this.watermark, cursor)
      startedAt ??= page.startedAt
      changes.push(...page.groups)
      if (changes.length > 10_000)
        throw new Error("Timer configuration capacity exceeded.")
      cursor = page.cursor ?? undefined
    } while (cursor && !this.stopped && !this.signal.aborted)
    if (this.stopped || this.signal.aborted) return
    for (const group of changes) {
      if (!group.enabled || !group.messages.length) {
        this.groups.delete(group.id)
        this.activeGroups.delete(group.id)
        continue
      }
      const previous = this.groups.get(group.id)
      if (group.sessionLive === false) this.deactivate(group.broadcasterId)
      if (
        previous &&
        previous.group.streamId !== group.streamId &&
        group.sessionLive
      ) {
        this.deactivate(group.broadcasterId)
        this.generations.set(
          group.broadcasterId,
          (this.generations.get(group.broadcasterId) ?? 0) + 1
        )
        this.reconcileAt = 0
      }
      if (
        previous &&
        previous.group.revision === group.revision &&
        previous.group.streamId === group.streamId
      ) {
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
        dueAt: timerDeadline(group, this.now()),
        diagnosedAt: 0,
      })
      if (this.sessions.has(group.broadcasterId))
        this.activeGroups.set(group.id, this.groups.get(group.id)!)
      if (!previous) this.reconcileAt = 0
    }
    if (changes.length) {
      this.broadcasters.clear()
      for (const entry of this.groups.values()) {
        const entries = this.broadcasters.get(entry.group.broadcasterId)
        if (entries) entries.push(entry)
        else this.broadcasters.set(entry.group.broadcasterId, [entry])
      }
    }
    for (const id of this.sessions.keys())
      if (!this.hasBroadcaster(id)) this.deactivate(id)
    for (const id of this.generations.keys())
      if (!this.hasBroadcaster(id)) {
        this.generations.delete(id)
        this.events.delete(id)
      }
    this.watermark = startedAt
    this.refreshedAt = this.now()
  }
  private valid(entry: Entry, session: Session): boolean {
    return (
      !this.stopped &&
      !this.signal.aborted &&
      this.groups.get(entry.group.id) === entry &&
      this.sessions.get(entry.group.broadcasterId) === session &&
      this.now() - this.refreshedAt <= TIMER_CONFIG_TTL_MS &&
      this.activity.eligible(
        entry.group.broadcasterId,
        entry.baseline,
        entry.group.minimumMessages,
        this.now()
      )
    )
  }
  private async send(entry: Entry): Promise<void> {
    const group = entry.group,
      session = this.sessions.get(group.broadcasterId)!
    let execution: Awaited<ReturnType<ConvexService["claimTimer"]>> = null
    let postStarted = false,
      confirmed = false
    let state: Settlement["state"] = "intervalPending"
    try {
      const token = await this.auth.appToken()
      execution = await this.convex.claimTimer(
        group.id,
        group.revision,
        session.id
      )
      if (!execution) {
        entry.dueAt = this.now() + RECONCILE_MS
        return
      }
      if (
        !this.valid(entry, session) ||
        !timerMessage.safeParse(execution.message).success ||
        execution.message !==
          group.messages[group.cursor % group.messages.length]
      )
        return
      const live = (
        await this.api.liveBroadcasters(token, [group.broadcasterId])
      ).get(group.broadcasterId)
      if (live?.id !== session.id) {
        this.deactivate(group.broadcasterId)
        this.reconcileAt = 0
        state = "waitingForStream"
        await this.convex.timerSession(group.broadcasterId, this.now(), live)
        return
      }
      const preparedAt = this.now()
      const sent = await this.api.sendChatMessage(
        token,
        group.broadcasterId,
        execution.message,
        async () => {
          if (
            !this.valid(entry, session) ||
            execution!.expiresAt <= this.now() ||
            this.now() - preparedAt >= PREPARED_FRESH_MS
          )
            return false
          // Only this final database fence runs at the queue slot. OAuth and
          // provider preparation stay outside. A slow fence releases the slot
          // within 500 ms and its matching definite settlement cancels late commits.
          let deadline: ReturnType<typeof setTimeout> | undefined
          const begun = await Promise.race([
            this.convex.beginTimer(
              group.id,
              execution!.executionId,
              session.id
            ),
            new Promise<false>((resolve) => {
              deadline = setTimeout(() => resolve(false), 500)
            }),
          ]).finally(() => clearTimeout(deadline))
          if (
            !begun ||
            !this.valid(entry, session) ||
            execution!.expiresAt <= this.now() ||
            this.now() - preparedAt >= PREPARED_FRESH_MS
          )
            return false
          postStarted = true
          return true
        },
        false
      )
      if (sent) {
        confirmed = true
        group.cursor = (group.cursor + 1) % group.messages.length
        group.lastSentAt = this.now()
        entry.baseline = this.activity.snapshot(group.broadcasterId).count
      }
    } catch (error) {
      state =
        error instanceof ChatBackpressure
          ? "rateLimited"
          : error instanceof TwitchFailure && error.status === 429
            ? "rateLimited"
            : error instanceof TwitchFailure &&
                (error.status === 401 || error.status === 403)
              ? "authorizationRevoked"
              : error instanceof TwitchFailure &&
                  (error.code === "messageDropped" ||
                    error.status === 400 ||
                    error.status === 422)
                ? "failed"
                : "providerUnavailable"
      if (
        error instanceof TwitchFailure &&
        (error.code === "messageDropped" ||
          (error.status !== undefined &&
            [400, 401, 403, 422, 429].includes(error.status)))
      )
        postStarted = false
      if (!execution) {
        entry.dueAt = this.now() + 60_000
        await this.diagnose(
          entry,
          error instanceof ChatBackpressure
            ? "rateLimited"
            : "providerUnavailable"
        )
      }
    } finally {
      if (execution) {
        const settlement = {
          entry,
          executionId: execution.executionId,
          sent: confirmed,
          definite: !postStarted,
          state,
          retryAt: this.now() + TIMER_REFRESH_MS,
        }
        this.settlements.set(execution.executionId, settlement)
        entry.dueAt = Infinity
        await this.persistSettlement(settlement)
      }
    }
  }
  private async persistSettlement(settlement: Settlement): Promise<void> {
    const { entry, executionId, sent, definite } = settlement
    try {
      await this.convex.settleTimer(
        entry.group.id,
        executionId,
        sent,
        definite,
        settlement.state
      )
      this.settlements.delete(executionId)
      if (sent || definite)
        entry.dueAt = sent
          ? this.now() + entry.group.intervalMinutes * 60_000
          : Math.max(this.now(), settlement.retryAt)
    } catch {
      this.logger.warn("Timer settlement pending")
    }
  }
  private async retrySettlements(): Promise<void> {
    for (const settlement of [...this.settlements.values()].slice(0, 4))
      await this.persistSettlement(settlement)
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
  stopAccepting(): void {
    this.stopped = true
    clearTimeout(this.timer)
  }
  async stop(): Promise<void> {
    this.stopAccepting()
    await this.work
    await Promise.allSettled(this.lifecycleWork)
    await this.retrySettlements()
    this.activity.clear()
    this.groups.clear()
    this.activeGroups.clear()
    this.broadcasters.clear()
    this.sessions.clear()
  }
}

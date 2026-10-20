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
  executionId?: string
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
  context: { group: TimerRuntimeGroup; session: Session }
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
  private scan?: { since?: number; cursor?: string; startedAt?: number }
  private overflowed = false
  private rescan = false
  private refreshedAt = 0
  private refreshAt = 0
  private reconcileAt = 0
  private reconciliation?: Promise<void>
  private readonly reconcileRetry = new Map<string, number>()
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
    const current = () =>
      !this.stopped &&
      this.events.get(broadcasterId) === eventAt &&
      eventAt >= (this.sessions.get(broadcasterId)?.observedAt ?? 0)
    const work = (
      online
        ? this.reconcile([broadcasterId], eventAt).then(() => {
            if (this.reconcileRetry.has(broadcasterId) && current())
              this.deactivate(broadcasterId)
          })
        : this.convex
            .timerSession(broadcasterId, this.now(), undefined, eventAt)
            .then(() => {})
    )
      .catch(() => {
        if (!current()) return
        this.deactivate(broadcasterId)
        this.reconcileRetry.set(broadcasterId, this.now() + 30_000)
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
    const generations = new Map(ids.map((id) => [id, this.generations.get(id)]))
    const failed = (id: string) => {
      if (
        this.hasBroadcaster(id) &&
        generations.get(id) === this.generations.get(id)
      )
        this.reconcileRetry.set(id, this.now() + 30_000)
    }
    let token: string
    try {
      token = await this.auth.appToken()
    } catch {
      ids.forEach(failed)
      this.logger.warn("Timer stream reconciliation unavailable")
      return
    }
    for (let offset = 0; offset < ids.length && !this.stopped; offset += 100) {
      const batch = ids.slice(offset, offset + 100)
      const observedAt = this.now()
      let live: Awaited<ReturnType<TwitchApiService["liveBroadcasters"]>>
      try {
        live = await this.api.liveBroadcasters(token, batch)
      } catch {
        batch.forEach(failed)
        this.logger.warn("Timer stream reconciliation unavailable")
        continue
      }
      let next = 0
      await Promise.all(
        Array.from({ length: Math.min(10, batch.length) }, async () => {
          while (next < batch.length && !this.stopped) {
            const id = batch[next++]!
            try {
              if (
                generations.get(id) !== this.generations.get(id) ||
                !this.hasBroadcaster(id)
              )
                continue
              if (this.now() - observedAt >= 55_000) {
                failed(id)
                continue
              }
              const stream = live.get(id)
              if (
                !(await this.convex.timerSession(
                  id,
                  observedAt,
                  stream,
                  eventAt
                )) ||
                this.now() - observedAt >= 60_000
              ) {
                failed(id)
                continue
              }
              if (
                this.stopped ||
                generations.get(id) !== this.generations.get(id)
              )
                continue
              this.reconcileRetry.delete(id)
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
            } catch {
              failed(id)
              this.logger.warn("Timer broadcaster reconciliation unavailable")
            }
          }
        })
      )
    }
  }
  private async reconcileDue(): Promise<void> {
    if (!this.reconciliation) {
      const full = this.now() >= this.reconcileAt
      const ids = full
        ? [...this.broadcasters.keys()]
        : [...this.reconcileRetry]
            .filter(([id, at]) => at <= this.now() && this.hasBroadcaster(id))
            .map(([id]) => id)
      if (!ids.length) return
      const work = this.reconcile(ids)
        .then(() => {
          if (full) this.reconcileAt = this.now() + RECONCILE_MS
        })
        .finally(() => {
          this.reconciliation = undefined
        })
      this.reconciliation = work
    }
    // Yield to timer work while bounded-concurrency control-plane work continues.
    let budget: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      this.reconciliation,
      new Promise<void>((resolve) => {
        budget = setTimeout(resolve, 50)
      }),
    ]).finally(() => clearTimeout(budget))
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
    await this.reconcileDue()
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
    const scan = (this.scan ??= { since: this.watermark })
    for (
      let pages = 0;
      pages < 4 && !this.stopped && !this.signal.aborted;
      pages++
    ) {
      const page = await this.convex.timerPage(
        scan.since,
        scan.cursor,
        scan.startedAt === undefined ? undefined : scan.startedAt + 120_000
      )
      if (this.stopped || this.signal.aborted) return
      if (page.groups.length > 100)
        throw new Error("Timer page capacity exceeded.")
      this.applyChanges(page.groups)
      // A page is acknowledged only after its changes and indexes are applied.
      // Each send still requires a current server claim and begin fence.
      scan.startedAt ??= page.startedAt
      scan.cursor = page.cursor ?? undefined
      this.refreshedAt = this.now()
      if (!scan.cursor) {
        this.watermark = this.rescan ? undefined : scan.startedAt
        this.scan = undefined
        if (this.rescan) {
          this.rescan = false
          this.overflowed = false
        }
        break
      }
    }
  }
  private applyChanges(changes: TimerRuntimeGroup[]): void {
    for (const group of changes) {
      if (!group.enabled || !group.messages.length) {
        this.groups.delete(group.id)
        this.activeGroups.delete(group.id)
        if (this.overflowed && this.groups.size < 10_000) this.rescan = true
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
        this.reconcileRetry.set(group.broadcasterId, 0)
      }
      if (
        previous &&
        previous.group.revision === group.revision &&
        previous.group.streamId === group.streamId
      ) {
        const pending = previous.executionId
          ? this.settlements.get(previous.executionId)
          : undefined
        if (
          !pending?.sent ||
          pending.context.group.streamId !== group.streamId
        ) {
          if (
            previous.group.cursor !== group.cursor ||
            previous.group.lastSentAt !== group.lastSentAt
          )
            previous.baseline = this.activity.snapshot(
              group.broadcasterId
            ).count
          previous.group.cursor = group.cursor
          previous.group.lastSentAt = group.lastSentAt
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
      if (!previous && this.groups.size >= 10_000) {
        if (!this.overflowed)
          this.logger.warn("Timer active configuration capacity exceeded")
        this.overflowed = true
        continue
      }
      this.groups.set(group.id, {
        group: { ...group, messages: [...group.messages] },
        baseline: this.activity.snapshot(group.broadcasterId).count,
        dueAt: timerDeadline(group, this.now()),
        diagnosedAt: 0,
      })
      if (this.sessions.has(group.broadcasterId))
        this.activeGroups.set(group.id, this.groups.get(group.id)!)
      if (!previous && !this.sessions.has(group.broadcasterId))
        this.reconcileRetry.set(group.broadcasterId, 0)
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
        this.reconcileRetry.delete(id)
      }
    for (const id of this.reconcileRetry.keys())
      if (!this.hasBroadcaster(id)) this.reconcileRetry.delete(id)
  }
  private owns(
    entry: Entry,
    context: Settlement["context"],
    executionId: string
  ): boolean {
    return (
      !this.stopped &&
      !this.signal.aborted &&
      this.groups.get(context.group.id) === entry &&
      this.sessions.get(context.group.broadcasterId) === context.session &&
      entry.group.revision === context.group.revision &&
      entry.group.streamId === context.group.streamId &&
      entry.executionId === executionId
    )
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
    const group = { ...entry.group, messages: [...entry.group.messages] },
      session = this.sessions.get(group.broadcasterId)!
    const context = { group, session }
    let execution: Awaited<ReturnType<ConvexService["claimTimer"]>> = null
    let outcome: "notAttempted" | "ambiguous" | "confirmed" | "rejected" =
      "notAttempted"
    let beganAt: number | undefined
    let attempted = false
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
      entry.executionId = execution.executionId
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
        this.reconcileRetry.set(group.broadcasterId, 0)
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
          beganAt = this.now()
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
          outcome = "ambiguous"
          attempted = true
          return true
        },
        false
      )
      if (sent) {
        outcome = "confirmed"
        if (this.owns(entry, context, execution.executionId)) {
          entry.group.cursor = (group.cursor + 1) % group.messages.length
          entry.group.lastSentAt = this.now()
          entry.baseline = this.activity.snapshot(group.broadcasterId).count
        }
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
        attempted &&
        error instanceof TwitchFailure &&
        (error.code === "messageDropped" ||
          (error.status !== undefined &&
            [400, 401, 403, 422, 429].includes(error.status)))
      )
        outcome = "rejected"
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
          sent: outcome === "confirmed",
          definite: outcome === "notAttempted" || outcome === "rejected",
          state,
          retryAt:
            outcome === "rejected" && beganAt !== undefined
              ? beganAt + group.intervalMinutes * 60_000
              : this.now() + TIMER_REFRESH_MS,
          context,
        }
        this.settlements.set(execution.executionId, settlement)
        if (this.owns(entry, context, execution.executionId))
          entry.dueAt = Infinity
        await this.persistSettlement(settlement)
      }
    }
  }
  private async persistSettlement(settlement: Settlement): Promise<void> {
    const { entry, executionId, sent, definite } = settlement
    try {
      const nextAt = await this.convex.settleTimer(
        entry.group.id,
        executionId,
        sent,
        definite,
        settlement.state
      )
      this.settlements.delete(executionId)
      if (
        this.owns(entry, settlement.context, executionId) &&
        (sent || definite)
      ) {
        entry.executionId = undefined
        entry.dueAt = sent
          ? (nextAt ?? this.now() + entry.group.intervalMinutes * 60_000)
          : Math.max(this.now(), nextAt ?? settlement.retryAt)
      }
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
    await this.reconciliation
    await Promise.allSettled(this.lifecycleWork)
    await this.retrySettlements()
    this.activity.clear()
    this.groups.clear()
    this.activeGroups.clear()
    this.broadcasters.clear()
    this.sessions.clear()
  }
}

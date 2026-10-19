import { TIMER_ACTIVITY_WINDOW_MS } from "@workspace/shared/twitchTimers"

type Activity = {
  count: number
  lastAt: number
  since: number
  ids: Map<string, number>
}
export class ChatActivity {
  private readonly channels = new Map<string, Activity>()
  constructor(private readonly botId: string) {}
  watch(broadcasters: Iterable<string>): void {
    const wanted = new Set(broadcasters)
    for (const id of this.channels.keys())
      if (!wanted.has(id)) this.channels.delete(id)
    for (const id of wanted)
      if (!this.channels.has(id) && this.channels.size < 10_000)
        this.channels.set(id, { count: 0, lastAt: 0, since: 0, ids: new Map() })
  }
  reset(broadcasterId: string, since: number): void {
    if (this.channels.has(broadcasterId))
      this.channels.set(broadcasterId, {
        count: 0,
        lastAt: 0,
        since,
        ids: new Map(),
      })
  }
  observe(
    broadcasterId: string,
    chatterId: string,
    messageId: string,
    eventAt: number,
    now = eventAt
  ): void {
    const activity = this.channels.get(broadcasterId)
    if (
      !activity ||
      chatterId === this.botId ||
      eventAt > now ||
      eventAt <= now - TIMER_ACTIVITY_WINDOW_MS ||
      eventAt < activity.since
    )
      return
    // Keep IDs for Twitch's entire accepted delivery age. At capacity, drop
    // activity rather than evicting IDs and counting redeliveries twice.
    for (const [id, seenAt] of activity.ids) {
      if (seenAt > now - 6 * 60_000) break
      activity.ids.delete(id)
    }
    if (activity.ids.has(messageId) || activity.ids.size >= 512) return
    activity.ids.set(messageId, now)
    activity.count++
    activity.lastAt = Math.max(activity.lastAt, eventAt)
  }
  snapshot(broadcasterId: string) {
    const state = this.channels.get(broadcasterId)
    return state
      ? { count: state.count, lastAt: state.lastAt }
      : { count: 0, lastAt: 0 }
  }
  eligible(
    broadcasterId: string,
    baseline: number,
    minimum: number,
    now: number
  ): boolean {
    const activity = this.snapshot(broadcasterId)
    return (
      activity.count - baseline >= minimum &&
      activity.lastAt > now - TIMER_ACTIVITY_WINDOW_MS &&
      activity.lastAt <= now
    )
  }
  clear(): void {
    this.channels.clear()
  }
}

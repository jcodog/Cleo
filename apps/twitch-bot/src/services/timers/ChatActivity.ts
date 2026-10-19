import { TIMER_ACTIVITY_WINDOW_MS } from "@workspace/shared/twitchTimers"

type Activity = { count: number; lastAt: number }
export class ChatActivity {
  private readonly channels = new Map<string, Activity>()
  private readonly ids = new Map<string, number>()
  constructor(private readonly botId: string) {}
  watch(broadcasters: Iterable<string>): void {
    const wanted = new Set(broadcasters)
    for (const id of this.channels.keys())
      if (!wanted.has(id)) this.channels.delete(id)
    for (const id of wanted)
      if (!this.channels.has(id) && this.channels.size < 10_000)
        this.channels.set(id, { count: 0, lastAt: 0 })
  }
  observe(
    broadcasterId: string,
    chatterId: string,
    messageId: string,
    now: number
  ): void {
    const activity = this.channels.get(broadcasterId)
    if (!activity || chatterId === this.botId) return
    // Keep IDs for Twitch's entire accepted delivery age. At capacity, drop
    // activity rather than evicting IDs and counting redeliveries twice.
    for (const [id, seenAt] of this.ids) {
      if (seenAt > now - 11 * 60_000) break
      this.ids.delete(id)
    }
    const key = `${broadcasterId}:${messageId}`
    if (this.ids.has(key) || this.ids.size >= 20_000) return
    this.ids.set(key, now)
    activity.count++
    activity.lastAt = now
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
    this.ids.clear()
  }
}

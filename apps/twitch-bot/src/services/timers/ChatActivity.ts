import { TIMER_ACTIVITY_WINDOW_MS } from "@workspace/shared/twitchTimers"
import { createHash } from "node:crypto"

type Bucket = { ids: Set<bigint>; mask: bigint }

type Activity = {
  count: number
  lastAt: number
  since: number
  observedAt: number
  buckets: Map<number, Bucket>
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
        this.channels.set(id, {
          count: 0,
          lastAt: 0,
          since: 0,
          observedAt: 0,
          buckets: new Map(),
        })
  }
  reset(broadcasterId: string, since: number): void {
    if (this.channels.has(broadcasterId))
      this.channels.set(broadcasterId, {
        count: 0,
        lastAt: 0,
        since,
        observedAt: since,
        buckets: new Map(),
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
    const currentAt = Math.max(now, activity?.observedAt ?? 0)
    if (
      !activity ||
      chatterId === this.botId ||
      eventAt > now + 60_000 ||
      eventAt <= currentAt - TIMER_ACTIVITY_WINDOW_MS ||
      eventAt < activity.since
    )
      return
    activity.observedAt = currentAt
    const epoch = Math.floor(currentAt / 60_000)
    // Six receipt-time buckets retain hashes for at least the entire five-minute
    // replay window. Scan bucket timestamps, never insertion order.
    for (const time of activity.buckets.keys())
      if (time <= epoch - 6) activity.buckets.delete(time)
    const hash = createHash("sha256")
      .update(messageId)
      .digest()
      .readBigUInt64BE()
    for (const bucket of activity.buckets.values())
      if (bucket.ids.has(hash) || (hash & bucket.mask) !== 0n) return
    let bucket = activity.buckets.get(epoch)
    if (!bucket) {
      bucket = { ids: new Set(), mask: 0n }
      activity.buckets.set(epoch, bucket)
    }
    // At 128 hashes per bucket, tighten deterministic sampling. A removed hash
    // stays excluded by that bucket's mask until expiry, so retries cannot count
    // it again. Counts are conservative samples, with no frozen capacity limit.
    while (bucket.ids.size >= 128) {
      bucket.mask = (bucket.mask << 1n) | 1n
      for (const id of bucket.ids)
        if ((id & bucket.mask) !== 0n) bucket.ids.delete(id)
    }
    if ((hash & bucket.mask) !== 0n) return
    bucket.ids.add(hash)
    activity.count++
    activity.lastAt = Math.max(activity.lastAt, Math.min(eventAt, now))
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

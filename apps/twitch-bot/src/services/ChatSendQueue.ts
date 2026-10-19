type Entry = {
  channel: string
  createdAt: number
  run: () => Promise<void>
  reject: (error: Error) => void
}
export class ChatBackpressure extends Error {
  constructor() {
    super("Chat send capacity unavailable.")
  }
}

// One queue per dedicated bot. Space attempts conservatively below 20/30s and
// 1/channel/second. A queued message expires rather than becoming a backlog.
export class ChatSendQueue {
  private readonly entries: Entry[] = []
  private readonly channels = new Map<string, number>()
  private nextAt = 0
  private lastChannel = ""
  private draining = false
  constructor(
    private readonly signal?: AbortSignal,
    private readonly now = Date.now,
    private readonly wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms))
  ) {}
  run<T>(channel: string, send: () => Promise<T>): Promise<T> {
    if (
      this.signal?.aborted ||
      this.entries.length >= 64 ||
      this.entries.filter((e) => e.channel === channel).length >= 4
    )
      return Promise.reject(new ChatBackpressure())
    return new Promise<T>((resolve, reject) => {
      this.entries.push({
        channel,
        createdAt: this.now(),
        reject,
        run: async () => {
          resolve(await send())
        },
      })
      void this.drain()
    })
  }
  defer(until: number): void {
    this.nextAt = Math.max(this.nextAt, until)
  }
  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.entries.length) {
        const now = this.now()
        for (let i = this.entries.length - 1; i >= 0; i--) {
          const entry = this.entries[i]!
          if (this.signal?.aborted || now - entry.createdAt >= 5_000) {
            this.entries.splice(i, 1)
            entry.reject(new ChatBackpressure())
          }
        }
        if (!this.entries.length) break
        const different = this.entries.findIndex(
          (e) => e.channel !== this.lastChannel
        )
        const index = different < 0 ? 0 : different
        const entry = this.entries[index]!
        const deadline = Math.max(
          this.nextAt,
          this.channels.get(entry.channel) ?? 0
        )
        if (deadline > now) {
          await this.wait(Math.min(deadline - now, 250))
          continue
        }
        this.entries.splice(index, 1)
        this.lastChannel = entry.channel
        this.nextAt = now + 1_700
        this.channels.set(entry.channel, now + 2_000)
        for (const [id, until] of this.channels)
          if (until <= now) this.channels.delete(id)
        try {
          await entry.run()
        } catch (error) {
          entry.reject(
            error instanceof Error ? error : new Error("Chat send failed.")
          )
        }
      }
    } finally {
      this.draining = false
    }
  }
}

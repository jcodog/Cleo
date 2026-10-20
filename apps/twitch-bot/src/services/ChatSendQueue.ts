type Entry = {
  channel: string
  createdAt: number
  ttl: number
  run: (attempt: () => void) => Promise<void>
  reject: (error: Error) => void
}
export class ChatBackpressure extends Error {
  constructor(
    readonly reason: "capacity" | "deadline" | "shutdown" = "capacity"
  ) {
    super(
      `Local chat send ${reason === "deadline" ? "deadline expired" : reason === "shutdown" ? "queue stopped" : "capacity unavailable"}.`
    )
  }
}

// One queue per dedicated bot. Space attempts conservatively below 20/30s and
// 1/channel/second. A queued message expires rather than becoming a backlog.
export class ChatSendQueue {
  private readonly entries: Entry[] = []
  private readonly channels = new Map<string, number>()
  private nextAt = 0
  private draining = false
  constructor(
    private readonly signal?: AbortSignal,
    private readonly now = Date.now,
    private readonly wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms))
  ) {}
  run<T>(
    channel: string,
    send: (attempt: () => void) => Promise<T>,
    durable = false,
    aged = false
  ): Promise<T> {
    if (
      this.signal?.aborted ||
      this.entries.length >= 64 ||
      this.entries.filter((e) => e.channel === channel).length >= 4
    )
      return Promise.reject(
        new ChatBackpressure(this.signal?.aborted ? "shutdown" : "capacity")
      )
    return new Promise<T>((resolve, reject) => {
      const entry = {
        channel,
        createdAt: durable ? Math.max(this.now(), this.nextAt) : this.now(),
        ttl: durable ? 60_000 : 5_000,
        reject,
        run: async (attempt: () => void) => {
          resolve(await send(attempt))
        },
      }
      // One timer may retain an already-waited turn after refreshing expired
      // pre-POST evidence. Its caller permits this once, never after a POST.
      if (aged && !durable) this.entries.unshift(entry)
      else this.entries.push(entry)
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
          if (this.signal?.aborted || now - entry.createdAt >= entry.ttl) {
            this.entries.splice(i, 1)
            entry.reject(
              new ChatBackpressure(
                this.signal?.aborted ? "shutdown" : "deadline"
              )
            )
          }
        }
        if (!this.entries.length) break
        // FIFO among eligible channels: a cooling head cannot reserve a free slot.
        const index = this.entries.findIndex(
          (e) => Math.max(this.nextAt, this.channels.get(e.channel) ?? 0) <= now
        )
        if (index < 0) {
          const deadline = Math.min(
            ...this.entries.map((e) =>
              Math.max(this.nextAt, this.channels.get(e.channel) ?? 0)
            )
          )
          await this.wait(Math.min(deadline - now, 250))
          continue
        }
        const entry = this.entries[index]!
        this.entries.splice(index, 1)
        for (const [id, until] of this.channels)
          if (until <= now) this.channels.delete(id)
        try {
          const attempt = () => {
            const at = this.now()
            this.nextAt = Math.max(this.nextAt, at + 1_700)
            this.channels.set(entry.channel, at + 2_000)
          }
          await entry.run(attempt)
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

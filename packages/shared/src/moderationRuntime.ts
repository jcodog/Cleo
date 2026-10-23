import { z } from "zod"
import {
  compileModerationPolicy,
  evaluateModeration,
  type ModerationMessage,
  type ModerationHistoryEntry,
} from "./moderation"

export const moderationRuntimePolicy = z.object({
  revision: z.number().int().nonnegative(),
  policyJSON: z.string().max(65536),
  enforcement: z.boolean(),
  authorityUntil: z.number().nonnegative(),
  leaseDurationMs: z.number().int().min(0).max(60000),
})
export type ModerationRuntimePolicy = z.infer<typeof moderationRuntimePolicy>
type Entry = {
  value: ModerationRuntimePolicy
  compiled: ReturnType<typeof compileModerationPolicy>
  fetchedAt: number
}

/** Adapters refresh active entries in the background. No timers or shared worker state here. */
export class ModerationRuntime {
  private readonly cache = new Map<string, Entry>()
  private readonly pending = new Map<string, Promise<void>>()
  private generation = 0
  private readonly histories = new Map<
    string,
    { messages: ModerationHistoryEntry[]; updatedAt: number }
  >()
  constructor(
    private readonly fetchPolicy: (scopeId: string) => Promise<unknown>,
    private readonly maximum = 1000
  ) {
    if (!Number.isInteger(maximum) || maximum < 1)
      throw new RangeError("Invalid runtime capacity.")
  }
  invalidate(scopeId: string) {
    this.cache.delete(scopeId)
    this.generation++
    this.pending.delete(scopeId)
  }
  async load(scopeId: string, now: number): Promise<void> {
    const cached = this.cache.get(scopeId)
    if (cached && now - cached.fetchedAt < 15000) return
    const existing = this.pending.get(scopeId)
    if (existing) return existing
    if (this.pending.size >= this.maximum) return
    const generation = this.generation
    const work = (async () => {
      try {
        const raw = await this.fetchPolicy(scopeId)
        const value = moderationRuntimePolicy.parse(
          raw ?? {
            revision: 0,
            policyJSON: "{}",
            enforcement: false,
            authorityUntil: 0,
            leaseDurationMs: 0,
          }
        )
        const compiled =
          cached?.value.policyJSON === value.policyJSON
            ? cached.compiled
            : compileModerationPolicy(JSON.parse(value.policyJSON))
        if (this.generation !== generation) return
        if (cached && value.revision < cached.value.revision) return
        this.cache.delete(scopeId)
        this.cache.set(scopeId, { value, compiled, fetchedAt: now })
        while (this.cache.size > this.maximum) {
          for (const oldest of this.cache.keys()) {
            this.cache.delete(oldest)
            break
          }
        }
      } catch {
        /* Last verified policy is detection-only after authority expires. */
      }
    })()
    this.pending.set(scopeId, work)
    try {
      await work
    } finally {
      if (this.pending.get(scopeId) === work) this.pending.delete(scopeId)
    }
  }
  async refresh(now: number): Promise<void> {
    for (const [scopeId, entry] of this.cache) {
      if (now - entry.fetchedAt > 300000) {
        this.invalidate(scopeId)
        continue
      }
      await this.load(scopeId, now)
    }
    for (const [key, history] of this.histories)
      if (now - history.updatedAt > 300000) this.histories.delete(key)
  }
  inspect(message: ModerationMessage, now: number) {
    const entry = this.cache.get(message.scopeId)
    if (!entry || now < entry.fetchedAt || now - entry.fetchedAt > 120000)
      return null
    const key = JSON.stringify([message.scopeId, message.authorId])
    const history = (this.histories.get(key)?.messages ?? []).filter(
      (h) => now - h.timestamp <= 300000
    )
    if (history.some((h) => h.id === message.id)) return null
    const decision = evaluateModeration({
      message,
      policy: entry.compiled,
      history,
      now,
    })
    history.push({
      id: message.id,
      scopeId: message.scopeId,
      authorId: message.authorId,
      content: message.content,
      timestamp: now,
    })
    let textLength = history.reduce((total, h) => total + h.content.length, 0)
    while (history.length > 64 || textLength > 57344)
      textLength -= history.shift()!.content.length
    this.histories.delete(key)
    this.histories.set(key, { messages: history, updatedAt: now })
    while (this.histories.size > this.maximum) {
      for (const oldest of this.histories.keys()) {
        this.histories.delete(oldest)
        break
      }
    }
    return {
      decision,
      enforce:
        entry.value.enforcement &&
        now - entry.fetchedAt < entry.value.leaseDurationMs - 5000,
    }
  }
}

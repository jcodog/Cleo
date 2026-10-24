import { z } from "zod"
import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex } from "@noble/hashes/utils"
import { normalizeModerationMessage } from "./moderation/normalize"
import {
  compileModerationPolicy,
  evaluateModeration,
  type ModerationMessage,
  MODERATION_LIMITS,
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
  private readonly pending = new Map<
    string,
    { token: object; work: Promise<void> }
  >()
  private activeLoads = 0
  private refreshing: Promise<void> | undefined
  private readonly histories = new Map<
    string,
    {
      messages: { id: string; timestamp: number; digest: string }[]
      updatedAt: number
    }
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
    this.pending.delete(scopeId)
  }
  async load(scopeId: string, now: number): Promise<void> {
    const cached = this.cache.get(scopeId)
    if (cached && now - cached.fetchedAt < 15000) return
    const existing = this.pending.get(scopeId)
    if (existing) return existing.work
    if (this.activeLoads >= this.maximum) return
    this.activeLoads++
    const token = {}
    const work = (async () => {
      try {
        const raw = await this.fetchPolicy(scopeId)
        const value = moderationRuntimePolicy.parse(
          raw === null
            ? {
                revision: 0,
                policyJSON: "{}",
                enforcement: false,
                authorityUntil: 0,
                leaseDurationMs: 0,
              }
            : raw
        )
        const compiled =
          cached?.value.policyJSON === value.policyJSON
            ? cached.compiled
            : compileModerationPolicy(JSON.parse(value.policyJSON))
        if (this.pending.get(scopeId)?.token !== token) return
        if (raw !== null && cached && value.revision < cached.value.revision)
          return
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
    this.pending.set(scopeId, { token, work })
    try {
      await work
    } finally {
      this.activeLoads--
      if (this.pending.get(scopeId)?.token === token)
        this.pending.delete(scopeId)
    }
  }
  async refresh(now: number): Promise<void> {
    if (this.refreshing) return this.refreshing
    const work = this.refreshPolicies(now)
    this.refreshing = work
    try {
      await work
    } finally {
      this.refreshing = undefined
    }
  }
  private async refreshPolicies(now: number): Promise<void> {
    const scopes: string[] = []
    for (const [scopeId, entry] of this.cache) {
      if (now - entry.fetchedAt > 300000) {
        this.invalidate(scopeId)
        continue
      }
      scopes.push(scopeId)
    }
    for (const [key, history] of this.histories)
      if (now - history.updatedAt > 300000) {
        this.histories.delete(key)
      }
    let cursor = 0
    await Promise.all(
      Array.from({ length: Math.min(4, scopes.length) }, async () => {
        while (cursor < scopes.length) await this.load(scopes[cursor++]!, now)
      })
    )
  }
  inspect(message: ModerationMessage, now: number) {
    const entry = this.cache.get(message.scopeId)
    if (!entry || now < entry.fetchedAt || now - entry.fetchedAt > 120000)
      return null
    const key = JSON.stringify([
      message.scopeId,
      message.historyScopeId ?? message.scopeId,
      message.authorId,
    ])
    const history = (this.histories.get(key)?.messages ?? []).filter(
      (h) => h.timestamp <= now && now - h.timestamp <= 300000
    )
    if (history.some((h) => h.id === message.id)) return null
    const text = normalizeModerationMessage(message).comparisonText
    const bytes = new Uint8Array(text.length * 2)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      bytes[i * 2] = code & 255
      bytes[i * 2 + 1] = code >>> 8
    }
    const digest = bytesToHex(sha256(bytes))
    const { duplicateMessages, flooding } = entry.compiled.policy.rules
    const recentCounts = {
      duplicateCount:
        1 +
        history.filter(
          (h) =>
            h.digest === digest &&
            now - h.timestamp <= duplicateMessages.windowMs
        ).length,
      floodCount:
        1 +
        history.filter((h) => now - h.timestamp <= flooding.windowMs).length,
    }
    const decision = evaluateModeration({
      message,
      policy: entry.compiled,
      recentCounts,
      now,
    })
    history.push({
      id: message.id,
      digest,
      timestamp: now,
    })
    while (history.length > MODERATION_LIMITS.historyEntries) history.shift()
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

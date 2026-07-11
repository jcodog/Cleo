import { convexBotClient } from "@/services/convexBotClient"
import { registerCleanupHook } from "@/runtime/shutdown"
import { botLogError } from "@/utils/botLog"
import {
  isBackendDiscordGuildRuntimeConfigDisabledReason,
  isDiscordSnowflake,
  validateBackendDiscordGuildRuntimeConfigResult,
  type DiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigDisabledReason,
  type DiscordGuildRuntimeConfigResult,
} from "@workspace/shared/discordRuntimeConfig"

export type {
  DiscordGuildRuntimeConfig,
  DiscordGuildRuntimeConfigDisabledReason,
  DiscordGuildRuntimeConfigResult,
}

type RuntimeConfigValidationOptions = {
  discordGuildId: string
  backendResult: unknown | null
  onError?: (message: string, error?: unknown) => void
}

type RuntimeConfigFetcher = (discordGuildId: string) => Promise<unknown | null>
type RuntimeConfigClock = () => number
type RuntimeConfigErrorLogger = (
  message: string,
  error?: unknown,
  metadata?: Record<string, unknown>
) => void
type CleanupTimer = ReturnType<typeof setInterval>

type DiscordGuildRuntimeConfigCacheOptions = {
  fetchBackendResult?: RuntimeConfigFetcher
  now?: RuntimeConfigClock
  onError?: RuntimeConfigErrorLogger
  readyTtlMs?: number
  disabledTtlMs?: number
  staleFallbackTtlMs?: number
  cleanupIntervalMs?: number
  maxEntries?: number
  startCleanupTimer?: boolean
  setInterval?: typeof setInterval
  clearInterval?: typeof clearInterval
}

type CachedRuntimeConfigEntry = {
  result: DiscordGuildRuntimeConfigResult
  expiresAt: number
  staleUntil: number
}

type RefreshToken = {
  cacheGeneration: number
  guildGeneration: number
}

export const DISCORD_GUILD_RUNTIME_CONFIG_CACHE_DEFAULTS = {
  // Keep manager changes responsive without polling Convex on every event.
  readyTtlMs: 60 * 1000,
  // Missing or disabled guild config is safe-disabled but rechecked quickly.
  disabledTtlMs: 30 * 1000,
  // A temporary refresh failure can reuse the last valid ready config briefly.
  staleFallbackTtlMs: 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
  maxEntries: 10_000,
} as const

export class DiscordGuildRuntimeConfigCache {
  private readonly fetchBackendResult: RuntimeConfigFetcher
  private readonly now: RuntimeConfigClock
  private readonly onError: RuntimeConfigErrorLogger
  private readonly readyTtlMs: number
  private readonly disabledTtlMs: number
  private readonly staleFallbackTtlMs: number
  private readonly maxEntries: number
  private readonly clearCleanupInterval: typeof clearInterval
  private readonly entries = new Map<string, CachedRuntimeConfigEntry>()
  private readonly pendingRefreshes = new Map<
    string,
    Promise<DiscordGuildRuntimeConfigResult>
  >()
  private readonly guildGenerations = new Map<string, number>()
  private cleanupTimer: CleanupTimer | null = null
  private cacheGeneration = 0

  public constructor(options: DiscordGuildRuntimeConfigCacheOptions = {}) {
    this.fetchBackendResult =
      options.fetchBackendResult ??
      ((discordGuildId) =>
        convexBotClient.fetchGuildRuntimeConfig(discordGuildId))
    this.now = options.now ?? Date.now
    this.onError = options.onError ?? botLogError
    this.readyTtlMs =
      options.readyTtlMs ??
      DISCORD_GUILD_RUNTIME_CONFIG_CACHE_DEFAULTS.readyTtlMs
    this.disabledTtlMs =
      options.disabledTtlMs ??
      DISCORD_GUILD_RUNTIME_CONFIG_CACHE_DEFAULTS.disabledTtlMs
    this.staleFallbackTtlMs =
      options.staleFallbackTtlMs ??
      DISCORD_GUILD_RUNTIME_CONFIG_CACHE_DEFAULTS.staleFallbackTtlMs
    this.maxEntries =
      options.maxEntries ??
      DISCORD_GUILD_RUNTIME_CONFIG_CACHE_DEFAULTS.maxEntries
    this.clearCleanupInterval = options.clearInterval ?? clearInterval

    if (options.startCleanupTimer ?? true) {
      const cleanupIntervalMs =
        options.cleanupIntervalMs ??
        DISCORD_GUILD_RUNTIME_CONFIG_CACHE_DEFAULTS.cleanupIntervalMs
      const interval = options.setInterval ?? setInterval

      this.cleanupTimer = interval(() => {
        this.cleanupExpiredEntries()
      }, cleanupIntervalMs)
      this.cleanupTimer.unref?.()
    }
  }

  public async get(
    discordGuildId: string
  ): Promise<DiscordGuildRuntimeConfigResult> {
    if (!isDiscordSnowflake(discordGuildId)) {
      this.onError("Invalid Discord guild ID for runtime config fetch.")
      return disabledConfig("invalidGuildId")
    }

    const now = this.now()
    const cachedEntry = this.entries.get(discordGuildId)

    if (cachedEntry && cachedEntry.expiresAt > now) {
      return cachedEntry.result
    }

    const pendingRefresh = this.pendingRefreshes.get(discordGuildId)

    if (pendingRefresh) {
      return await pendingRefresh
    }

    const refreshToken: RefreshToken = {
      cacheGeneration: this.cacheGeneration,
      guildGeneration: this.guildGenerations.get(discordGuildId) ?? 0,
    }
    const refresh = this.refresh(discordGuildId, cachedEntry, refreshToken)
    this.pendingRefreshes.set(discordGuildId, refresh)

    try {
      return await refresh
    } finally {
      if (this.pendingRefreshes.get(discordGuildId) === refresh) {
        this.pendingRefreshes.delete(discordGuildId)
      }
    }
  }

  public invalidate(discordGuildId: string): void {
    const hadPendingRefresh = this.pendingRefreshes.delete(discordGuildId)
    const hadEntry = this.entries.delete(discordGuildId)

    if (hadPendingRefresh || hadEntry) {
      this.guildGenerations.set(
        discordGuildId,
        (this.guildGenerations.get(discordGuildId) ?? 0) + 1
      )
    }
  }

  public clear(): void {
    this.entries.clear()
    this.pendingRefreshes.clear()
    this.guildGenerations.clear()
    this.cacheGeneration += 1
  }

  public cleanupExpiredEntries(now = this.now()): void {
    for (const [discordGuildId, entry] of this.entries) {
      if (entry.staleUntil <= now) {
        this.entries.delete(discordGuildId)
      }
    }

    if (this.entries.size <= this.maxEntries) {
      return
    }

    const entriesByExpiry = Array.from(this.entries.entries()).sort(
      ([, left], [, right]) => left.staleUntil - right.staleUntil
    )

    for (const [discordGuildId] of entriesByExpiry) {
      if (this.entries.size <= this.maxEntries) {
        break
      }

      this.entries.delete(discordGuildId)
    }
  }

  public dispose(): void {
    if (this.cleanupTimer) {
      this.clearCleanupInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    this.clear()
  }

  public size(): number {
    return this.entries.size
  }

  private async refresh(
    discordGuildId: string,
    previousEntry: CachedRuntimeConfigEntry | undefined,
    refreshToken: RefreshToken
  ): Promise<DiscordGuildRuntimeConfigResult> {
    try {
      const backendResult = await this.fetchBackendResult(discordGuildId)
      const result = validateDiscordGuildRuntimeConfigBackendResult({
        discordGuildId,
        backendResult,
        onError: this.onError,
      })

      if (isRefreshFailureResult(result)) {
        return this.getRefreshFailureResult(result, previousEntry)
      }

      this.cacheResult(discordGuildId, result, refreshToken)

      return result
    } catch (error) {
      this.onError("Discord guild runtime config refresh failed.", error, {
        discordGuildId,
      })

      return this.getRefreshFailureResult(
        disabledConfig("convexUnavailable"),
        previousEntry
      )
    }
  }

  private getRefreshFailureResult(
    failureResult: DiscordGuildRuntimeConfigResult,
    previousEntry: CachedRuntimeConfigEntry | undefined
  ): DiscordGuildRuntimeConfigResult {
    if (this.canUseStaleFallback(previousEntry)) {
      return previousEntry.result
    }

    return failureResult
  }

  private canUseStaleFallback(
    previousEntry: CachedRuntimeConfigEntry | undefined
  ): previousEntry is CachedRuntimeConfigEntry {
    return (
      previousEntry !== undefined &&
      previousEntry.result.status === "ready" &&
      previousEntry.expiresAt <= this.now() &&
      previousEntry.staleUntil > this.now()
    )
  }

  private cacheResult(
    discordGuildId: string,
    result: DiscordGuildRuntimeConfigResult,
    refreshToken: RefreshToken
  ): void {
    if (!this.isCurrentRefresh(discordGuildId, refreshToken)) {
      return
    }

    const now = this.now()
    const ttlMs =
      result.status === "ready" ? this.readyTtlMs : this.disabledTtlMs
    const expiresAt = now + ttlMs
    const staleUntil =
      result.status === "ready"
        ? expiresAt + this.staleFallbackTtlMs
        : expiresAt

    this.entries.set(discordGuildId, {
      result,
      expiresAt,
      staleUntil,
    })
    this.cleanupExpiredEntries(now)
  }

  private isCurrentRefresh(
    discordGuildId: string,
    refreshToken: RefreshToken
  ): boolean {
    return (
      refreshToken.cacheGeneration === this.cacheGeneration &&
      refreshToken.guildGeneration ===
        (this.guildGenerations.get(discordGuildId) ?? 0)
    )
  }
}

const discordGuildRuntimeConfigCache = new DiscordGuildRuntimeConfigCache()

registerCleanupHook(() => {
  discordGuildRuntimeConfigCache.dispose()
})

export async function fetchDiscordGuildRuntimeConfig(
  discordGuildId: string
): Promise<DiscordGuildRuntimeConfigResult> {
  return await discordGuildRuntimeConfigCache.get(discordGuildId)
}

export function invalidateDiscordGuildRuntimeConfig(
  discordGuildId: string
): void {
  discordGuildRuntimeConfigCache.invalidate(discordGuildId)
}

export function clearDiscordGuildRuntimeConfigCache(): void {
  discordGuildRuntimeConfigCache.clear()
}

export function validateDiscordGuildRuntimeConfigBackendResult({
  discordGuildId,
  backendResult,
  onError,
}: RuntimeConfigValidationOptions): DiscordGuildRuntimeConfigResult {
  if (!isDiscordSnowflake(discordGuildId)) {
    onError?.("Invalid Discord guild ID for runtime config fetch.")
    return disabledConfig("invalidGuildId")
  }

  if (backendResult === null) {
    return disabledConfig("convexUnavailable")
  }

  const parsedResult = validateBackendDiscordGuildRuntimeConfigResult(
    backendResult,
    discordGuildId
  )

  if (!parsedResult.success) {
    onError?.(
      "Invalid Convex guild runtime config response.",
      new Error(parsedResult.error)
    )
    return disabledConfig("invalidBackendResponse")
  }

  return parsedResult.data
}

function disabledConfig(
  reason: DiscordGuildRuntimeConfigDisabledReason
): DiscordGuildRuntimeConfigResult {
  return {
    status: "disabled",
    reason,
  }
}

function isRefreshFailureResult(
  result: DiscordGuildRuntimeConfigResult
): boolean {
  return (
    result.status === "disabled" &&
    !isBackendDiscordGuildRuntimeConfigDisabledReason(result.reason)
  )
}

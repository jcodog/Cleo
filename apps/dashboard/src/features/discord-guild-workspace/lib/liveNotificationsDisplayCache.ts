import type { LiveNotificationsView } from "../sections/useLiveNotifications"

export type LiveDisplay = Pick<
  LiveNotificationsView,
  "source" | "discordStatus" | "verifiedAt"
>
export const LIVE_DISPLAY_TTL_MS = 5 * 60_000
const storageKey = "cleo.live-notifications.display.v1"
const maxEntries = 12

function parseDisplay(value: unknown): LiveDisplay | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("verifiedAt" in value) ||
    typeof value.verifiedAt !== "number" ||
    !Number.isSafeInteger(value.verifiedAt) ||
    !("discordStatus" in value) ||
    (value.discordStatus !== "ready" &&
      value.discordStatus !== "unavailable" &&
      value.discordStatus !== "needsChannel" &&
      value.discordStatus !== "needsRole") ||
    !("source" in value) ||
    !value.source ||
    typeof value.source !== "object" ||
    !("status" in value.source)
  )
    return
  const source = value.source
  if (source.status === "ready") {
    if (
      !("broadcasterId" in source) ||
      typeof source.broadcasterId !== "string" ||
      !("login" in source) ||
      typeof source.login !== "string" ||
      !("displayName" in source) ||
      typeof source.displayName !== "string" ||
      ("avatarUrl" in source && typeof source.avatarUrl !== "string")
    )
      return
    return {
      verifiedAt: value.verifiedAt,
      discordStatus: value.discordStatus,
      source: {
        status: "ready",
        broadcasterId: source.broadcasterId,
        login: source.login,
        displayName: source.displayName,
        ...("avatarUrl" in source && typeof source.avatarUrl === "string"
          ? { avatarUrl: source.avatarUrl }
          : {}),
      },
    }
  }
  if (
    source.status !== "needsLink" &&
    source.status !== "stale" &&
    source.status !== "missingPermission"
  )
    return
  return {
    verifiedAt: value.verifiedAt,
    discordStatus: value.discordStatus,
    source: { status: source.status },
  }
}

export function liveDisplayKey(
  userId: string,
  sessionId: string,
  guild: string,
  ownerKey: string
) {
  return JSON.stringify([userId, sessionId, guild, ownerKey])
}

/** Display only. No configuration, tokens, permissions, or authorisation proof. */
export class LiveNotificationsDisplayCache {
  private entries = new Map<string, LiveDisplay>()
  constructor(
    private storage: () => Pick<Storage, "getItem" | "setItem"> | undefined
  ) {}

  private load(now: number) {
    try {
      const encoded = this.storage()?.getItem(storageKey)
      const values: unknown = encoded ? JSON.parse(encoded) : []
      if (Array.isArray(values))
        for (const entry of values.slice(-maxEntries)) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") continue
          const display = parseDisplay(entry[1])
          if (
            display &&
            display.verifiedAt <= now &&
            display.verifiedAt + LIVE_DISPLAY_TTL_MS > now &&
            (this.entries.get(entry[0])?.verifiedAt ?? -1) < display.verifiedAt
          )
            this.entries.set(entry[0], display)
        }
    } catch {
      /* Session storage is optional. */
    }
    for (const [key, display] of this.entries)
      if (
        display.verifiedAt > now ||
        display.verifiedAt + LIVE_DISPLAY_TTL_MS <= now
      )
        this.entries.delete(key)
    while (this.entries.size > maxEntries)
      this.entries.delete(this.entries.keys().next().value!)
  }
  private persist() {
    try {
      this.storage()?.setItem(storageKey, JSON.stringify([...this.entries]))
    } catch {
      /* Keep the in-memory session cache if storage is unavailable. */
    }
  }
  read(key: string, now = Date.now()) {
    this.load(now)
    return this.entries.get(key)
  }
  write(key: string, view: LiveNotificationsView, now = Date.now()) {
    this.load(now)
    const display = parseDisplay(view)
    if (
      !display ||
      display.verifiedAt > now ||
      display.verifiedAt + LIVE_DISPLAY_TTL_MS <= now
    )
      return
    const existing = this.entries.get(key)
    if (existing && existing.verifiedAt > display.verifiedAt) return
    this.entries.delete(key)
    this.entries.set(key, display)
    this.load(now)
    this.persist()
  }
  remove(key: string) {
    this.entries.delete(key)
    this.persist()
  }
  invalidate(userId: string, sessionId: string, guild: string) {
    this.load(Date.now())
    const prefix = JSON.stringify([userId, sessionId, guild]).slice(0, -1) + ","
    for (const key of this.entries.keys())
      if (key.startsWith(prefix)) this.entries.delete(key)
    this.persist()
  }
}

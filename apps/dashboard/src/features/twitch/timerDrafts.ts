import {
  timerDraft,
  type TimerDraft,
  type TimerConfiguration,
} from "@workspace/shared/twitchTimers"

export type TimerDraftScope = { userId: string; broadcasterId: string }
export function timerDraftKey(
  scope: TimerDraftScope | null,
  groupId?: string
): string | undefined {
  return scope
    ? `cleo:twitch:timer-draft:v1:${scope.userId}:${scope.broadcasterId}:${groupId ?? "new"}`
    : undefined
}
export function readTimerDraft(
  key: string | undefined
): TimerDraft | undefined {
  if (!key || typeof window === "undefined") return
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw || raw.length > 32_000) return
    const result = timerDraft.safeParse(JSON.parse(raw))
    return result.success ? result.data : undefined
  } catch {
    return
  }
}
export function writeTimerDraft(
  key: string | undefined,
  configuration: TimerConfiguration,
  revision?: number
): boolean {
  if (!key || typeof window === "undefined") return false
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ version: 1, configuration, revision })
    )
    return true
  } catch {
    return false
  }
}
export function clearTimerDraft(key: string | undefined): void {
  if (!key || typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    /* Storage may be unavailable. */
  }
}

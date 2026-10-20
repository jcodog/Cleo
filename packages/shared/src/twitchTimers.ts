import { z } from "zod"

export const TIMER_ACTIVITY_WINDOW_MS = 5 * 60_000
export const TIMER_REFRESH_MS = 15_000
export const TIMER_CONFIG_TTL_MS = 60_000
export const TIMER_LEASE_MS = 60_000
export const timerMessage = z.string().refine(
  (message) =>
    message.trim().length > 0 &&
    !/^[/.]/u.test(message.trimStart()) &&
    [...message].length <= 500 &&
    ![...message].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || (code >= 127 && code <= 159)
    }),
  "Use 1-500 characters without control characters or a leading / or . command."
)
export const timerConfiguration = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(5).max(120),
  minimumMessages: z.number().int().min(1).max(100),
  messages: z.array(timerMessage).min(1).max(20),
})
export type TimerConfiguration = z.infer<typeof timerConfiguration>
export const timerRuntimeState = z.enum([
  "ready",
  "waitingForStream",
  "waitingForActivity",
  "intervalPending",
  "rateLimited",
  "providerUnavailable",
  "authorizationRevoked",
  "failed",
  "uncertain",
])
export const timerRuntimeGroup = timerConfiguration.extend({
  messages: z.array(timerMessage).max(20),
  id: z.string(),
  broadcasterId: z.string(),
  revision: z.number(),
  cursor: z.number(),
  streamId: z.string().optional(),
  sessionStartedAt: z.number().optional(),
  sessionLive: z.boolean().optional(),
  lastSentAt: z.number().optional(),
  lastAttemptAt: z.number().optional(),
})
export type TimerRuntimeGroup = z.infer<typeof timerRuntimeGroup>

// Callers supply server-resolved capacity. Disabled groups retain their place.
export function eligibleTimerGroups<T extends { broadcasterChanged: boolean }>(
  groups: readonly T[],
  limit: number
): T[] {
  return groups.filter((group) => !group.broadcasterChanged).slice(0, limit)
}

// Metadata edits retain the next message. Changing the ordered messages starts
// the edited rotation at zero; an older execution cannot advance that revision.
export function editedTimerCursor(
  previous: { messages: readonly string[]; cursor: number },
  messages: readonly string[]
): number {
  return previous.messages.length === messages.length &&
    previous.messages.every((message, index) => message === messages[index])
    ? previous.cursor
    : 0
}

export function timerDeadline(
  group: Pick<
    TimerRuntimeGroup,
    "lastAttemptAt" | "lastSentAt" | "intervalMinutes"
  >,
  startedAt: number
): number {
  return (
    Math.max(startedAt, group.lastAttemptAt ?? 0, group.lastSentAt ?? 0) +
    group.intervalMinutes * 60_000
  )
}

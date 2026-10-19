import { z } from "zod"

export const TIMER_ACTIVITY_WINDOW_MS = 5 * 60_000
export const TIMER_REFRESH_MS = 15_000
export const TIMER_CONFIG_TTL_MS = 60_000
export const TIMER_LEASE_MS = 60_000
export const timerMessage = z
  .string()
  .refine(
    (message) =>
      message.trim().length > 0 &&
      [...message].length <= 500 &&
      !/[\u0000-\u001f\u007f-\u009f]/u.test(message),
    "Use 1-500 characters without control characters."
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
  "failed",
  "uncertain",
])
export const timerRuntimeGroup = timerConfiguration.extend({
  messages: z.array(timerMessage).max(20),
  id: z.string(),
  broadcasterId: z.string(),
  revision: z.number(),
  cursor: z.number(),
  lastSentAt: z.number().optional(),
  lastAttemptAt: z.number().optional(),
})
export type TimerRuntimeGroup = z.infer<typeof timerRuntimeGroup>

export function timerDeadline(
  group: Pick<TimerRuntimeGroup, "lastAttemptAt" | "intervalMinutes">,
  startedAt: number
): number {
  return (
    Math.max(startedAt, group.lastAttemptAt ?? 0) +
    group.intervalMinutes * 60_000
  )
}

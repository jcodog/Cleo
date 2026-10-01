import { z } from "zod"
import { readPrivateJson, writePrivateJson } from "../auth/privateFile"

const readinessSchema = z.object({
  version: z.literal(1),
  pid: z.number().int().positive(),
  startedAt: z.number().finite(),
  updatedAt: z.number().finite(),
  state: z.enum(["starting", "ready", "unhealthy", "stopped"]),
})
export type ReadinessState = z.infer<typeof readinessSchema>

export async function writeReadiness(
  path: string,
  state: ReadinessState
): Promise<void> {
  await writePrivateJson(path, readinessSchema.parse(state))
}

export async function checkReadiness(options: {
  path: string
  expectedPid: number
  notBefore: number
  now?: number
  isAlive?: (pid: number) => boolean
}): Promise<boolean> {
  const now = options.now ?? Date.now()
  const alive =
    options.isAlive ??
    ((pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    })
  try {
    const value = await readPrivateJson(options.path, 4096)
    const parsed = readinessSchema.safeParse(value)
    if (!parsed.success) return false
    const state = parsed.data
    return (
      state.state === "ready" &&
      state.pid === options.expectedPid &&
      state.startedAt >= options.notBefore &&
      state.startedAt <= state.updatedAt &&
      state.updatedAt <= now &&
      now - state.updatedAt <= 90000 &&
      alive(state.pid)
    )
  } catch {
    return false
  }
}

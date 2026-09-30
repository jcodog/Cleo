import { constants } from "node:fs"
import { open, rename, unlink } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { z } from "zod"

const readinessSchema = z.object({
  version: z.literal(1),
  pid: z.number().int().positive(),
  startedAt: z.number().finite(),
  updatedAt: z.number().finite(),
  state: z.enum(["starting", "ready", "unhealthy", "stopped"]),
  subscriptionId: z.string().optional(),
})
export type ReadinessState = z.infer<typeof readinessSchema>

export async function writeReadiness(
  path: string,
  state: ReadinessState
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(JSON.stringify(state))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
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
    const handle = await open(
      options.path,
      constants.O_RDONLY | constants.O_NOFOLLOW
    )
    let value: unknown
    try {
      const stat = await handle.stat()
      if (
        !stat.isFile() ||
        stat.size > 4096 ||
        (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
      )
        return false
      value = JSON.parse(await handle.readFile("utf8"))
    } finally {
      await handle.close()
    }
    const parsed = readinessSchema.safeParse(value)
    if (!parsed.success) return false
    const state = parsed.data
    return (
      state.state === "ready" &&
      !!state.subscriptionId &&
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

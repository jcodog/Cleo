import { constants } from "node:fs"
import { link, lstat, open, rename, unlink } from "node:fs/promises"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"

import { TwitchApi, TwitchFailure, type BotToken } from "./api"
import type { TwitchCredentials } from "@workspace/env/twitch"

const grantSchema = z.object({
  version: z.literal(1),
  clientId: z.string().min(1),
  botUserId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().finite().positive(),
})
export type BotGrant = z.infer<typeof grantSchema>

export class GrantStore {
  constructor(
    readonly path: string,
    private readonly lockTimeoutMs = 10000
  ) {}

  async read(): Promise<BotGrant> {
    const handle = await open(
      this.path,
      constants.O_RDONLY | constants.O_NOFOLLOW
    )
    try {
      const stat = await handle.stat()
      if (
        !stat.isFile() ||
        stat.size > 16384 ||
        (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
      )
        throw new Error("Bot grant must be a private regular file.")
      const result = grantSchema.safeParse(
        JSON.parse(await handle.readFile("utf8"))
      )
      if (!result.success) throw new Error("Invalid bot grant file.")
      return result.data
    } catch {
      throw new Error("Cannot read a valid private bot grant file.")
    } finally {
      await handle.close()
    }
  }

  async write(grant: BotGrant, overwrite = true): Promise<void> {
    const dir = dirname(this.path)
    const directory = await lstat(dir)
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      (process.platform !== "win32" && (directory.mode & 0o077) !== 0)
    )
      throw new Error(
        "Bot grant directory must be private and must not be a symlink."
      )
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      const handle = await open(temporary, "wx", 0o600)
      try {
        await handle.writeFile(JSON.stringify(grantSchema.parse(grant)))
        await handle.sync()
      } finally {
        await handle.close()
      }
      if (overwrite) await rename(temporary, this.path)
      else await link(temporary, this.path)
      if (process.platform !== "win32") {
        const parent = await open(dir, constants.O_RDONLY)
        try {
          await parent.sync()
        } finally {
          await parent.close()
        }
      }
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }

  async locked<T>(operation: () => Promise<T>): Promise<T> {
    const lock = `${this.path}.lock`
    const deadline = Date.now() + this.lockTimeoutMs
    let handle
    while (!handle) {
      try {
        handle = await open(lock, "wx", 0o600)
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST"
        ))
          throw new Error("Cannot acquire bot grant lock.", { cause: error })
        if (Date.now() >= deadline)
          throw new Error(
            "Bot grant is locked. Check for an active operator/runtime before removing a stale lock.",
            { cause: error }
          )
        await delay(50)
      }
    }
    try {
      await handle.writeFile(String(process.pid))
      return await operation()
    } finally {
      await handle.close()
      await unlink(lock)
    }
  }
}

export function createGrant(
  token: BotToken,
  config: TwitchCredentials
): BotGrant {
  return {
    version: 1,
    clientId: config.TWITCH_CLIENT_ID,
    botUserId: config.TWITCH_BOT_USER_ID,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}

export async function ensureBotGrant(
  api: TwitchApi,
  store: GrantStore,
  config: TwitchCredentials
): Promise<void> {
  await store.locked(async () => {
    const grant = await store.read()
    if (grant.clientId !== config.TWITCH_CLIENT_ID)
      throw new TwitchFailure("wrongClient")
    if (grant.botUserId !== config.TWITCH_BOT_USER_ID)
      throw new TwitchFailure("wrongBot")
    try {
      await api.validateBotToken(grant.accessToken)
      return
    } catch (error) {
      if (!(
        error instanceof TwitchFailure &&
        (error.code === "unauthorized" || error.code === "expiredToken")
      ))
        throw error
    }
    const token = await api.refreshBotToken(grant.refreshToken)
    // Preserve refresh rotation even if the following validation request fails.
    await store.write(createGrant(token, config))
    await api.validateBotToken(token.access_token)
  })
}

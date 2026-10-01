import { lstat, open, unlink } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"

import {
  TwitchApiService,
  TwitchFailure,
  type BotToken,
} from "../services/TwitchApiService"
import type { TwitchCredentials } from "@workspace/env/twitch"
import {
  readPrivateJson,
  writePrivateJson,
  syncPrivateDirectory,
} from "./privateFile"

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
    const rotated = `${this.path}.rotated`
    if (await this.exists(rotated)) return this.readGrant(rotated)
    if (await this.exists(`${this.path}.refreshing`))
      throw new Error(
        "Bot refresh was interrupted before recovery was saved. Reauthorize the bot; the old grant must not be reused."
      )
    return this.readGrant(this.path)
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await lstat(path)
      return true
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return false
      throw error
    }
  }

  private async readGrant(path: string): Promise<BotGrant> {
    try {
      const result = grantSchema.safeParse(await readPrivateJson(path, 16384))
      if (!result.success) throw new Error("Invalid bot grant file.")
      return result.data
    } catch {
      throw new Error("Cannot read a valid private bot grant file.")
    }
  }

  async recoverRotation(): Promise<void> {
    const rotated = `${this.path}.rotated`
    if (!(await this.exists(rotated))) return
    await this.write(await this.readGrant(rotated))
    await unlink(`${this.path}.refreshing`).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error
    })
    await unlink(rotated)
    await syncPrivateDirectory(this.path)
  }

  async prepareRotation(grant: BotGrant): Promise<void> {
    // Reserve a durable interruption marker before making the remote refresh.
    await new GrantStore(`${this.path}.refreshing`).write(grant, false)
  }

  async persistRotation(grant: BotGrant): Promise<void> {
    // A separate, durable record survives failures replacing the primary file.
    // Retry local persistence only; never repeat the remote refresh request.
    const recovery = new GrantStore(`${this.path}.rotated`)
    for (let attempt = 0; ; attempt++) {
      try {
        await recovery.write(grant, false)
        break
      } catch (error) {
        if (attempt === 2) throw error
        await delay(50)
      }
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await this.recoverRotation()
        return
      } catch (error) {
        if (attempt === 2) throw error
        await delay(50)
      }
    }
  }

  async write(grant: BotGrant, overwrite = true): Promise<void> {
    await writePrivateJson(this.path, grantSchema.parse(grant), overwrite)
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
  api: TwitchApiService,
  store: GrantStore,
  config: TwitchCredentials
): Promise<void> {
  await store.locked(async () => {
    await store.recoverRotation()
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
    await store.prepareRotation(grant)
    const token = await api.refreshBotToken(grant.refreshToken)
    // Preserve refresh rotation even if the following validation request fails.
    await store.persistRotation(createGrant(token, config))
    await api.validateBotToken(token.access_token)
  })
}

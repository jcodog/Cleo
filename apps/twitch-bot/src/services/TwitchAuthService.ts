import type { TwitchRuntimeEnv } from "@workspace/env/twitch"
import { ensureBotGrant, GrantStore } from "../auth/grantStore"
import { TwitchApiService, TwitchFailure } from "./TwitchApiService"

export class TwitchAuthService {
  private token?: string
  constructor(
    private readonly api: TwitchApiService,
    private readonly store: GrantStore,
    private readonly config: TwitchRuntimeEnv
  ) {}
  async maintain(): Promise<string> {
    await ensureBotGrant(this.api, this.store, this.config)
    if (this.token) {
      try {
        await this.api.validateAppToken(this.token)
        return this.token
      } catch (error) {
        if (
          !(error instanceof TwitchFailure) ||
          !["unauthorized", "expiredToken"].includes(error.code)
        )
          throw error
        this.token = undefined
      }
    }
    this.token = await this.api.acquireAppToken()
    return this.token
  }
  async appToken(): Promise<string> {
    return this.token ?? this.maintain()
  }
}

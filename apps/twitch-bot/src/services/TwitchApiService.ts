import { z } from "zod"

import type { TwitchCredentials } from "@workspace/env/twitch"

export const BOT_SCOPES = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
] as const

export type TwitchFailureCode =
  | "timeout"
  | "networkUnavailable"
  | "apiUnavailable"
  | "unauthorized"
  | "malformedResponse"
  | "wrongClient"
  | "wrongBot"
  | "missingScope"
  | "expiredToken"
  | "broadcasterUnavailable"
  | "messageDropped"

export class TwitchFailure extends Error {
  constructor(
    readonly code: TwitchFailureCode,
    readonly status?: number
  ) {
    super(`Twitch operation failed: ${code}`)
    this.name = "TwitchFailure"
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.literal("bearer"),
})
const botTokenSchema = tokenSchema.extend({
  refresh_token: z.string().min(1),
  scope: z.array(z.string()),
})
const validationSchema = z.object({
  client_id: z.string().min(1),
  user_id: z.string().nullish(),
  scopes: z
    .array(z.string())
    .nullable()
    .transform((scopes) => scopes ?? []),
  expires_in: z.number().int().nonnegative(),
})
export type BotToken = z.infer<typeof botTokenSchema>
export class TwitchApiService {
  constructor(
    private readonly config: Pick<
      TwitchCredentials,
      | "TWITCH_CLIENT_ID"
      | "TWITCH_CLIENT_SECRET"
      | "TWITCH_BOT_USER_ID"
      | "TWITCH_HTTP_TIMEOUT_MS"
    >,
    private readonly requestFetch: typeof fetch = fetch,
    private readonly shutdownSignal?: AbortSignal
  ) {}

  async acquireAppToken(): Promise<string> {
    const token = await this.tokenRequest(tokenSchema, {
      grant_type: "client_credentials",
    })
    await this.validateAppToken(token.access_token)
    return token.access_token
  }

  refreshBotToken(refreshToken: string): Promise<BotToken> {
    return this.tokenRequest(botTokenSchema, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  }

  exchangeBotCode(code: string, redirectUri: string): Promise<BotToken> {
    return this.tokenRequest(botTokenSchema, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  }

  async validateAppToken(accessToken: string): Promise<void> {
    const value = await this.validate(accessToken)
    if (value.user_id) throw new TwitchFailure("wrongClient")
  }

  async validateBotToken(accessToken: string): Promise<void> {
    const value = await this.validate(accessToken)
    if (value.user_id !== this.config.TWITCH_BOT_USER_ID)
      throw new TwitchFailure("wrongBot")
    if (!BOT_SCOPES.every((scope) => value.scopes.includes(scope)))
      throw new TwitchFailure("missingScope")
  }

  async broadcasterExists(
    appToken: string,
    broadcasterId: string
  ): Promise<void> {
    const result = await this.request(
      z.object({ data: z.array(z.object({ id: z.string() })) }),
      `https://api.twitch.tv/helix/users?id=${encodeURIComponent(broadcasterId)}`,
      this.helixHeaders(appToken)
    )
    if (!result.data.some((user) => user.id === broadcasterId))
      throw new TwitchFailure("broadcasterUnavailable")
  }

  async sendChatMessage(
    botUserToken: string,
    broadcasterId: string,
    message: string
  ): Promise<string> {
    if (
      !message.trim() ||
      [...message].length > 500 ||
      [...message].some(
        (character) =>
          character.charCodeAt(0) < 32 ||
          (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159)
      )
    )
      throw new Error(
        "Message must contain 1-500 characters without control characters."
      )
    const result = await this.request(
      z.object({
        data: z.array(
          z.object({ message_id: z.string(), is_sent: z.boolean() })
        ),
      }),
      "https://api.twitch.tv/helix/chat/messages",
      {
        ...this.helixHeaders(botUserToken),
        method: "POST",
        body: JSON.stringify({
          broadcaster_id: broadcasterId,
          sender_id: this.config.TWITCH_BOT_USER_ID,
          message,
        }),
      }
    )
    const entry = result.data[0]
    if (!entry?.is_sent || !entry.message_id)
      throw new TwitchFailure("messageDropped")
    return entry.message_id
  }

  private async validate(accessToken: string) {
    const value = await this.request(
      validationSchema,
      "https://id.twitch.tv/oauth2/validate",
      { headers: { Authorization: `OAuth ${accessToken}` } }
    )
    if (value.client_id !== this.config.TWITCH_CLIENT_ID)
      throw new TwitchFailure("wrongClient")
    if (value.expires_in === 0) throw new TwitchFailure("expiredToken")
    return value
  }

  private tokenRequest<T>(
    schema: z.ZodType<T>,
    fields: Record<string, string>
  ): Promise<T> {
    return this.request(schema, "https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.TWITCH_CLIENT_ID,
        client_secret: this.config.TWITCH_CLIENT_SECRET,
        ...fields,
      }),
    })
  }

  private helixHeaders(appToken: string): RequestInit {
    return {
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Client-Id": this.config.TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
    }
  }

  private async request<T>(
    schema: z.ZodType<T>,
    url: string,
    init: RequestInit
  ): Promise<T> {
    const timeout = AbortSignal.timeout(this.config.TWITCH_HTTP_TIMEOUT_MS)
    const signal = this.shutdownSignal
      ? AbortSignal.any([timeout, this.shutdownSignal])
      : timeout
    let response: Response
    try {
      response = await this.requestFetch(url, {
        ...init,
        signal,
        redirect: "error",
      })
    } catch {
      throw new TwitchFailure(
        timeout.aborted ? "timeout" : "networkUnavailable"
      )
    }
    if (!response.ok)
      throw new TwitchFailure(
        response.status === 401 || response.status === 403
          ? "unauthorized"
          : "apiUnavailable",
        response.status
      )
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new TwitchFailure(timeout.aborted ? "timeout" : "malformedResponse")
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new TwitchFailure("malformedResponse")
    return parsed.data
  }
}

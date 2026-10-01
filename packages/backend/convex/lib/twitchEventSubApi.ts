"use node"

import { z } from "zod"
import {
  eventDefinitions,
  type EventKey,
} from "@workspace/shared/twitchEventSub"

const externalSubscription = z.object({
  id: z.string().min(1),
  status: z.string(),
  type: z.string(),
  version: z.string(),
  condition: z.record(z.string(), z.string()),
  transport: z.object({ method: z.string(), callback: z.string().optional() }),
})
const pageSchema = z.object({
  data: z.array(externalSubscription),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
})
export class EventSubProviderError extends Error {
  constructor(readonly kind: "failed" | "providerUnavailable") {
    super("Twitch subscription operation unavailable.")
  }
}
export class TwitchEventSubApi {
  constructor(
    private readonly config: {
      clientId: string
      clientSecret: string
      callback: string
      secret: string
    },
    private readonly request: typeof fetch = fetch
  ) {
    const url = new URL(config.callback)
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/eventsub" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.port && url.port !== "443")
    )
      throw new Error("Public HTTPS /eventsub callback required.")
  }
  async acquireToken(): Promise<string> {
    const response = await this.fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "client_credentials",
      }),
    })
    return z
      .object({ access_token: z.string().min(1) })
      .parse(await response.json()).access_token
  }
  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      "Client-Id": this.config.clientId,
      "Content-Type": "application/json",
    }
  }
  async find(token: string, key: EventKey, condition: Record<string, string>) {
    const definition = eventDefinitions[key]
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const url = new URL("https://api.twitch.tv/helix/eventsub/subscriptions")
      url.searchParams.set("type", definition.type)
      url.searchParams.set("first", "100")
      if (cursor) url.searchParams.set("after", cursor)
      const page = pageSchema.parse(
        await (
          await this.fetch(url.href, { headers: this.headers(token) })
        ).json()
      )
      const matches = page.data.filter(
        (row) =>
          row.type === definition.type &&
          row.version === definition.version &&
          row.transport.method === "webhook" &&
          row.transport.callback === this.config.callback &&
          Object.keys(condition).length === Object.keys(row.condition).length &&
          Object.entries(condition).every(
            ([name, value]) => row.condition[name] === value
          )
      )
      for (const row of matches) {
        if (
          row.status === "enabled" ||
          row.status === "webhook_callback_verification_pending"
        )
          return row
        await this.delete(token, row.id)
      }
      cursor = page.pagination?.cursor
      if (cursor) {
        if (cursors.has(cursor) || cursors.size >= 100)
          throw new EventSubProviderError("failed")
        cursors.add(cursor)
      }
    } while (cursor)
    return null
  }
  async create(
    token: string,
    key: EventKey,
    condition: Record<string, string>
  ) {
    const definition = eventDefinitions[key]
    let response: Response
    try {
      response = await this.fetch(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          method: "POST",
          headers: this.headers(token),
          body: JSON.stringify({
            type: definition.type,
            version: definition.version,
            condition,
            transport: {
              method: "webhook",
              callback: this.config.callback,
              secret: this.config.secret,
            },
          }),
        }
      )
    } catch (error) {
      // Recover a provider conflict or lost create response by exact identity.
      const existing = await this.find(token, key, condition)
      if (existing) return existing
      throw error
    }
    const result = pageSchema.parse(await response.json()).data[0]
    if (!result) throw new EventSubProviderError("failed")
    return result
  }
  async delete(token: string, id: string) {
    const response = await this.request(
      `https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: this.headers(token),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }
    )
    if (!response.ok && response.status !== 404)
      throw new EventSubProviderError(
        response.status >= 500 || response.status === 429
          ? "providerUnavailable"
          : "failed"
      )
  }
  private async fetch(url: string, init: RequestInit) {
    let response: Response
    try {
      response = await this.request(url, {
        ...init,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      })
    } catch {
      throw new EventSubProviderError("providerUnavailable")
    }
    if (!response.ok)
      throw new EventSubProviderError(
        response.status >= 500 || response.status === 429
          ? "providerUnavailable"
          : "failed"
      )
    return response
  }
}

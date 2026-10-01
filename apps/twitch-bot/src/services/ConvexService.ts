import { z } from "zod"
import type { EventKey } from "@workspace/shared/twitchEventSub"

export class ConvexService {
  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly request: typeof fetch = fetch
  ) {}
  async reserve(messageId: string, key: EventKey, broadcasterId: string) {
    return z
      .object({ duplicate: z.boolean(), template: z.string().optional() })
      .parse(
        await this.action("twitchEventSubActions:reserveEvent", {
          messageId,
          key,
          broadcasterId,
        })
      )
  }
  async streamOnline(messageId: string, event: unknown): Promise<void> {
    await this.action("liveNotificationActions:receiveOnline", {
      messageId,
      event,
    })
  }
  async subscriptionState(
    subscriptionId: string,
    revoked: boolean,
    key?: EventKey,
    broadcasterId?: string
  ): Promise<void> {
    await this.action("twitchEventSubActions:webhookState", {
      subscriptionId,
      revoked,
      key,
      broadcasterId,
    })
  }
  private async action(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const response = await this.request(new URL("/api/action", this.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: name,
        args: { ...args, secret: this.secret },
        format: "json",
      }),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    })
    if (!response.ok) throw new Error("Convex event action unavailable.")
    const result = z
      .object({
        status: z.enum(["success", "error"]),
        value: z.unknown().optional(),
      })
      .parse(await response.json())
    if (result.status !== "success")
      throw new Error("Convex event action rejected.")
    return result.value
  }
}

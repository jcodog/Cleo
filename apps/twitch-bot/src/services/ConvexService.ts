import { z } from "zod"
import type { EventKey } from "@workspace/shared/twitchEventSub"

export class ConvexActionError extends Error {
  constructor(
    readonly action: string,
    readonly kind: "http" | "backend" | "timeout" | "network",
    readonly status?: number,
    readonly backendCode?: string
  ) {
    super(
      `Convex action ${action}: ${kind}${status ? ` HTTP ${status}` : ""}${backendCode ? ` (${backendCode})` : ""}`
    )
  }
}
function safeBackendCode(value: unknown): string | undefined {
  const text = typeof value === "string" ? value : ""
  if (text.includes("Unauthorized Twitch worker.")) return "unauthorizedWorker"
  if (text.includes("Invalid event.")) return "invalidEvent"
  if (text.includes("provider unavailable")) return "providerUnavailable"
  return undefined
}
export class ConvexService {
  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly request: typeof fetch = fetch,
    private readonly signal?: AbortSignal
  ) {}
  async reserve(
    messageId: string,
    key: EventKey,
    broadcasterId: string,
    eventJson?: string
  ) {
    return z
      .discriminatedUnion("kind", [
        z.object({
          kind: z.literal("pending"),
          template: z.string().optional(),
        }),
        z.object({ kind: z.enum(["ignored", "terminal"]) }),
      ])
      .parse(
        await this.action("twitchEventSubActions:reserveEvent", {
          messageId,
          key,
          broadcasterId,
          eventJson,
        })
      )
  }
  async begin(messageId: string, attempt: string): Promise<boolean> {
    return z
      .boolean()
      .parse(
        await this.action("twitchEventSubActions:beginDispatch", {
          messageId,
          attempt,
        })
      )
  }
  async finish(
    messageId: string,
    attempt: string,
    sent: boolean
  ): Promise<void> {
    await this.action("twitchEventSubActions:finishDispatch", {
      messageId,
      attempt,
      sent,
    })
  }
  async pendingEvents(cursor?: string) {
    return z
      .object({
        events: z.array(
          z.object({
            messageId: z.string(),
            key: z.string(),
            broadcasterId: z.string(),
            eventJson: z.string(),
          })
        ),
        cursor: z.string().nullable(),
      })
      .parse(
        await this.action("twitchEventSubActions:pendingEvents", { cursor })
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
    const deadline = AbortSignal.timeout(5000)
    let response: Response
    try {
      response = await this.request(new URL("/api/action", this.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: name,
          args: { ...args, secret: this.secret },
          format: "json",
        }),
        signal: this.signal
          ? AbortSignal.any([deadline, this.signal])
          : deadline,
        redirect: "error",
      })
    } catch {
      throw new ConvexActionError(
        name,
        deadline.aborted ? "timeout" : "network"
      )
    }
    const body: unknown = await response.json().catch(() => null)
    const result = z
      .object({
        status: z.enum(["success", "error"]),
        value: z.unknown().optional(),
        errorMessage: z.string().optional(),
      })
      .safeParse(body)
    if (!response.ok)
      throw new ConvexActionError(
        name,
        "http",
        response.status,
        result.success ? safeBackendCode(result.data.errorMessage) : undefined
      )
    if (!result.success || result.data.status !== "success")
      throw new ConvexActionError(
        name,
        "backend",
        response.status,
        result.success ? safeBackendCode(result.data.errorMessage) : undefined
      )
    return result.data.value
  }
}

import { z } from "zod"
import type { EventKey } from "@workspace/shared/twitchEventSub"
import {
  timerRuntimeGroup,
  timerRuntimeState,
} from "@workspace/shared/twitchTimers"

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
  async timerPage(since?: number, cursor?: string) {
    return z
      .object({
        groups: z.array(timerRuntimeGroup),
        cursor: z.string().nullable(),
        startedAt: z.number(),
      })
      .parse(await this.action("twitchTimerActions:page", { since, cursor }))
  }
  async claimTimer(id: string, revision: number, streamId: string) {
    return z
      .object({
        executionId: z.string(),
        message: z.string(),
        expiresAt: z.number(),
      })
      .nullable()
      .parse(
        await this.action("twitchTimerActions:claim", {
          id,
          revision,
          streamId,
        })
      )
  }
  async settleTimer(
    id: string,
    executionId: string,
    sent: boolean,
    definite = false
  ): Promise<void> {
    await this.action("twitchTimerActions:settle", {
      id,
      executionId,
      sent,
      definite,
    })
  }
  async beginTimer(
    id: string,
    executionId: string,
    streamId: string
  ): Promise<boolean> {
    return z.boolean().parse(
      await this.action("twitchTimerActions:begin", {
        id,
        executionId,
        streamId,
      })
    )
  }
  async timerSession(
    broadcasterId: string,
    observedAt: number,
    stream?: { id: string; startedAt: number },
    eventAt?: number
  ): Promise<boolean> {
    return z.boolean().parse(
      await this.action("twitchTimerActions:session", {
        broadcasterId,
        observedAt,
        streamId: stream?.id,
        startedAt: stream?.startedAt,
        eventAt,
      })
    )
  }
  async diagnoseTimer(
    id: string,
    revision: number,
    state: z.infer<typeof timerRuntimeState>
  ): Promise<void> {
    await this.action("twitchTimerActions:diagnose", { id, revision, state })
  }
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
    return z.boolean().parse(
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
    broadcasterId?: string,
    reason?: string
  ): Promise<void> {
    await this.action("twitchEventSubActions:webhookState", {
      subscriptionId,
      revoked,
      key,
      broadcasterId,
      reason,
    })
  }
  async reportReadiness(clientId: string, botId: string): Promise<void> {
    await this.action("twitchChatActions:reportReadiness", { clientId, botId })
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

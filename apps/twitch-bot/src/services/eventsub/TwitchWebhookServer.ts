import { createServer, type Server } from "node:http"
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import type { Logger } from "@workspace/logger"
import { routes, type EventSubRouter } from "./EventSubRouter"
import type { ConvexService } from "../ConvexService"

export const MAX_WEBHOOK_BYTES = 65536
const envelope = z.object({
  subscription: z.object({
    id: z.string().min(1).max(512),
    type: z.string(),
    version: z.string(),
    condition: z.record(z.string(), z.string()),
  }),
  challenge: z.string().min(1).max(4096).optional(),
  event: z.unknown().optional(),
})
export class TwitchWebhookServer {
  private server?: Server
  private readonly pending = new Set<Promise<void>>()
  get isListening(): boolean {
    return this.server?.listening === true
  }
  constructor(
    private readonly secret: string,
    private readonly convex: Pick<
      ConvexService,
      "reserve" | "subscriptionState"
    >,
    private readonly router: Pick<EventSubRouter, "dispatch">,
    private readonly logger: Logger
  ) {}
  async handle(request: Request, now = Date.now()): Promise<Response> {
    if (
      request.method === "GET" &&
      new URL(request.url).pathname === "/healthz"
    )
      return new Response("ok")
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/eventsub"
    )
      return new Response(null, { status: 404 })
    const messageId = request.headers.get("Twitch-Eventsub-Message-Id") ?? ""
    const timestamp =
      request.headers.get("Twitch-Eventsub-Message-Timestamp") ?? ""
    const signature =
      request.headers.get("Twitch-Eventsub-Message-Signature") ?? ""
    const time = Date.parse(timestamp)
    if (
      !messageId ||
      messageId.length > 512 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(timestamp) ||
      !Number.isFinite(time) ||
      time < now - 600000 ||
      time > now + 60000 ||
      !/^sha256=[a-f0-9]{64}$/.test(signature)
    )
      return new Response(null, { status: 403 })
    let raw: Uint8Array
    try {
      raw = await boundedBody(request)
    } catch {
      return new Response(null, { status: 413 })
    }
    const expected = createHmac("sha256", this.secret)
      .update(messageId + timestamp)
      .update(raw)
      .digest()
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex")))
      return new Response(null, { status: 403 })
    try {
      const value = envelope.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw))
      )
      const route = routes.find(
        (route) =>
          route.type === value.subscription.type &&
          route.version === value.subscription.version
      )
      if (!route) return new Response(null, { status: 400 })
      const type = request.headers.get("Twitch-Eventsub-Message-Type")
      if (this.pending.size >= 256) return new Response(null, { status: 503 })
      if (type === "webhook_callback_verification") {
        if (!value.challenge) return new Response(null, { status: 400 })
        const task = this.convex
          .subscriptionState(
            value.subscription.id,
            false,
            route.key,
            value.subscription.condition.broadcaster_user_id ??
              value.subscription.condition.to_broadcaster_user_id
          )
          .catch(() => {
            this.logger.warn("EventSub verification status unavailable", {
              subscription: value.subscription.id,
            })
          })
          .finally(() => this.pending.delete(task))
        this.pending.add(task)
        return new Response(value.challenge, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
      if (type === "revocation") {
        await this.convex.subscriptionState(value.subscription.id, true)
        this.logger.warn("EventSub revoked", {
          type: route.type,
          subscription: value.subscription.id,
        })
        return new Response(null, { status: 204 })
      }
      if (type !== "notification") return new Response(null, { status: 400 })
      const parsed = route.parse(value.event)
      const conditionId =
        value.subscription.condition.broadcaster_user_id ??
        value.subscription.condition.to_broadcaster_user_id
      if (conditionId !== parsed.broadcasterId)
        return new Response(null, { status: 400 })
      this.logger.info("EventSub received", {
        type: route.type,
        broadcasterId: parsed.broadcasterId,
      })
      if (route.key === "streamOnline") {
        await this.router.dispatch(parsed, route.key, messageId)
        this.logger.info("Convex stream.online action accepted", {
          messageId,
          broadcasterId: parsed.broadcasterId,
        })
        return new Response(null, { status: 204 })
      }
      const receipt = await this.convex.reserve(
        messageId,
        route.key,
        parsed.broadcasterId
      )
      if (receipt.duplicate) return new Response(null, { status: 204 })
      const task = this.router
        .dispatch(parsed, route.key, messageId, receipt.template)
        .catch(() => {
          this.logger.error("Event handler failed after durable reservation", {
            messageId,
            type: route.type,
          })
        })
        .finally(() => this.pending.delete(task))
      this.pending.add(task)
      return new Response(null, { status: 204 })
    } catch (error) {
      return new Response(null, {
        status:
          error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 503,
      })
    }
  }
  async start(port: number, host = "127.0.0.1"): Promise<void> {
    this.server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of incoming) {
          size += chunk.length
          if (size > MAX_WEBHOOK_BYTES) {
            outgoing.writeHead(413).end()
            return
          }
          chunks.push(chunk)
        }
        const headers = new Headers()
        for (const [name, value] of Object.entries(incoming.headers))
          if (typeof value === "string") headers.set(name, value)
        const body = Buffer.concat(chunks)
        const request = new Request(`http://localhost${incoming.url}`, {
          method: incoming.method,
          headers,
          ...(incoming.method === "POST" ? { body } : {}),
        })
        const response = await this.handle(request)
        outgoing
          .writeHead(
            response.status,
            Object.fromEntries(response.headers.entries())
          )
          .end(Buffer.from(await response.arrayBuffer()))
      } catch {
        outgoing.writeHead(503).end()
      }
    })
    this.server.requestTimeout = 10000
    this.server.headersTimeout = 5000
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject)
      this.server!.listen(port, host, resolve)
    })
    this.logger.info("Twitch webhook listener ready", { host, port })
  }
  async stop(): Promise<void> {
    if (this.server?.listening)
      await new Promise<void>((resolve, reject) =>
        this.server!.close((error) => (error ? reject(error) : resolve()))
      )
    await Promise.all(this.pending)
  }
}
export async function boundedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_WEBHOOK_BYTES) {
        await reader.cancel()
        throw new Error("Body too large.")
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}

import { createLogger } from "@workspace/logger"
import { twitchEventSubSecret } from "@workspace/env/twitch"

const MAX_BODY_BYTES = 1024 * 1024
const REPLAY_WINDOW_MS = 10 * 60 * 1000
const logger = createLogger("twitch-eventsub")

export async function handleTwitchWebhook(
  request: Request,
  secret: string | undefined,
  now = Date.now()
): Promise<Response> {
  if (!twitchEventSubSecret.safeParse(secret).success || !secret)
    return new Response("Webhook unavailable.", { status: 503 })
  const id = request.headers.get("Twitch-Eventsub-Message-Id") ?? ""
  const timestamp =
    request.headers.get("Twitch-Eventsub-Message-Timestamp") ?? ""
  const signature =
    request.headers.get("Twitch-Eventsub-Message-Signature") ?? ""
  const time = Date.parse(timestamp)
  if (
    !id ||
    id.length > 512 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(timestamp) ||
    !Number.isFinite(time) ||
    time < now - REPLAY_WINDOW_MS ||
    time > now + 60000 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  )
    return new Response("Invalid webhook signature.", { status: 403 })
  let payload: Uint8Array
  try {
    payload = await boundedBody(request)
  } catch {
    return new Response("Invalid webhook body.", { status: 413 })
  }
  const prefix = new TextEncoder().encode(id + timestamp)
  const signed = new Uint8Array(prefix.length + payload.length)
  signed.set(prefix)
  signed.set(payload, prefix.length)
  const expectedSignature = Uint8Array.from(
    signature.slice(7).match(/../g) ?? [],
    (pair) => parseInt(pair, 16)
  )
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  // Web Crypto performs the MAC comparison without a JS string comparison.
  if (!(await crypto.subtle.verify("HMAC", key, expectedSignature, signed)))
    return new Response("Invalid webhook signature.", { status: 403 })
  let value: unknown
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(payload)
    )
  } catch {
    return new Response("Invalid webhook payload.", { status: 400 })
  }
  if (
    !isRecord(value) ||
    !isRecord(value.subscription) ||
    typeof value.subscription.id !== "string" ||
    value.subscription.type !== "channel.chat.message" ||
    value.subscription.version !== "1" ||
    !isRecord(value.subscription.condition) ||
    typeof value.subscription.condition.broadcaster_user_id !== "string" ||
    typeof value.subscription.condition.user_id !== "string"
  )
    return new Response("Invalid webhook subscription.", { status: 400 })
  const type = request.headers.get("Twitch-Eventsub-Message-Type")
  if (type === "webhook_callback_verification") {
    if (
      typeof value.challenge !== "string" ||
      !value.challenge ||
      value.challenge.length > 4096
    )
      return new Response("Invalid challenge.", { status: 400 })
    return new Response(value.challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": String(
          new TextEncoder().encode(value.challenge).length
        ),
      },
    })
  }
  if (type === "notification") {
    if (!isRecord(value.event))
      return new Response("Invalid notification.", { status: 400 })
    // No chat side effects or stored chat content. Valid redelivery is harmless.
    logger.debug("Twitch chat notification acknowledged", {
      subscriptionId: value.subscription.id,
    })
    return new Response(null, { status: 204 })
  }
  if (type === "revocation") {
    logger.warn("Twitch chat subscription revoked", {
      subscriptionId: value.subscription.id,
    })
    return new Response(null, { status: 204 })
  }
  return new Response("Unsupported webhook message.", { status: 400 })
}

async function boundedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_BODY_BYTES) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

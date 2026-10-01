import { httpRouter } from "convex/server"

import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"
import { backendEnv } from "@workspace/env/backend"
import { normalizeClerkUserData } from "./lib/clerkUserData"
import { type ClerkWebhookEvent, verifyClerkWebhook } from "./lib/clerkWebhook"
import { boundedBody, handleTwitchWebhook } from "./lib/twitchWebhook"
import { createLogger, serializeLogError } from "@workspace/logger"

const http = httpRouter()
const liveLogger = createLogger("twitch-live-sources")

http.route({
  path: "/twitch-eventsub",
  method: "POST",
  handler: httpAction(async (ctx, request) =>
    handleTwitchWebhook(
      request,
      backendEnv.TWITCH_EVENTSUB_SECRET,
      Date.now(),
      (event) => ctx.runMutation(internal.liveNotifications.receive, event)
    )
  ),
})

http.route({
  path: "/twitch-live-sources",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const configured = backendEnv.TWITCH_RUNTIME_CONVEX_SECRET
    const received = request.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/)?.[1]
    if (!configured || !received)
      return new Response("Unauthorized.", { status: 401 })
    const digest = async (value: string) =>
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
      )
    const [actual, expected] = await Promise.all([
      digest(received),
      digest(configured),
    ])
    let difference = 0
    for (let index = 0; index < expected.length; index++)
      difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0)
    if (difference !== 0) return new Response("Unauthorized.", { status: 401 })
    try {
      let bytes: Awaited<ReturnType<typeof boundedBody>>
      try {
        bytes = await boundedBody(request, 65536)
      } catch {
        return new Response("Invalid body.", { status: 413 })
      }
      let body: string
      try {
        body = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      } catch {
        return new Response("Invalid body.", { status: 400 })
      }
      let value: unknown
      try {
        value = JSON.parse(body)
      } catch {
        return new Response("Invalid body.", { status: 400 })
      }
      if (
        !value ||
        typeof value !== "object" ||
        !("states" in value) ||
        !Array.isArray(value.states) ||
        value.states.length > 500
      )
        return new Response("Invalid body.", { status: 400 })
      if (
        ("cursor" in value &&
          value.cursor !== null &&
          (typeof value.cursor !== "string" || value.cursor.length > 4096)) ||
        ("healthOnly" in value && typeof value.healthOnly !== "boolean")
      )
        return new Response("Invalid body.", { status: 400 })
      const states: {
        broadcasterId: string
        status: "ready" | "pending" | "unavailable"
      }[] = []
      for (const entry of value.states) {
        if (
          !entry ||
          typeof entry !== "object" ||
          !("broadcasterId" in entry) ||
          typeof entry.broadcasterId !== "string" ||
          !/^[1-9]\d*$/.test(entry.broadcasterId) ||
          !("status" in entry) ||
          (entry.status !== "ready" &&
            entry.status !== "pending" &&
            entry.status !== "unavailable")
        )
          return new Response("Invalid body.", { status: 400 })
        states.push({
          broadcasterId: entry.broadcasterId,
          status: entry.status,
        })
      }
      await ctx.runMutation(internal.liveNotifications.subscriptions, {
        states,
      })
      if ("healthOnly" in value && value.healthOnly === true)
        return Response.json({ broadcasterIds: [], continueCursor: null })
      const sources = await ctx.runAction(
        internal.liveNotificationActions.runtimeSources,
        { cursor: "cursor" in value ? (value.cursor as string | null) : null }
      )
      return Response.json(sources)
    } catch (error) {
      liveLogger.error(
        "Twitch live notification source reconciliation failed",
        { error: serializeLogError(error) }
      )
      return new Response("Live notification sources unavailable.", {
        status: 503,
      })
    }
  }),
})

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await validateClerkWebhook(request)

    if (!event) {
      return new Response("Invalid webhook signature.", { status: 400 })
    }

    if (event.type === "user.created" || event.type === "user.updated") {
      const userData = normalizeClerkUserData(event.data)

      if (!userData) {
        return new Response("Invalid Clerk user payload.", { status: 400 })
      }

      await ctx.runMutation(
        internal.mutations.integrations.clerk.users.upsertFromWebhook,
        {
          data: userData,
        }
      )
      return new Response(null, { status: 200 })
    }

    const deletedClerkUserId =
      event.type === "user.deleted" ? getDeletedClerkUserId(event.data) : null

    if (deletedClerkUserId) {
      await ctx.runMutation(
        internal.mutations.integrations.clerk.users.deleteFromWebhook,
        {
          clerkUserId: deletedClerkUserId,
        }
      )
    }

    return new Response(null, { status: 200 })
  }),
})

async function validateClerkWebhook(
  request: Request
): Promise<ClerkWebhookEvent | null> {
  const webhookSecret = backendEnv.CLERK_WEBHOOK_SECRET

  if (!webhookSecret) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET")
  }

  const payload = await request.text()
  return verifyClerkWebhook({
    payload,
    secret: webhookSecret,
    headers: {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    },
  })
}

function getDeletedClerkUserId(data: unknown): string | null {
  if (!isObjectRecord(data) || !("id" in data)) {
    return null
  }

  const id = data.id

  return typeof id === "string" ? id : null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export default http

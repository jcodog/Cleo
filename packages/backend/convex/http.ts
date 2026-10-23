import { httpRouter } from "convex/server"

import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"
import { boundedWebhookBody } from "./lib/boundedWebhookBody"
import { backendEnv } from "@workspace/env/backend"
import { normalizeClerkUserData } from "./lib/clerkUserData"
import { type ClerkWebhookEvent, verifyClerkWebhook } from "./lib/clerkWebhook"

const http = httpRouter()
http.route({
  path: "/stripe-community-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await boundedWebhookBody(request, 262144)
    if (body === null) return new Response(null, { status: 413 })
    try {
      const valid = await ctx.runAction(internal.premiumActions.webhook, {
        body,
        signature: request.headers.get("stripe-signature") ?? "",
      })
      return new Response(null, { status: valid ? 204 : 400 })
    } catch {
      return new Response(null, { status: 503 })
    }
  }),
})
http.route({
  path: "/discord-application-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await boundedWebhookBody(request, 65536)
    if (body === null) return new Response(null, { status: 413 })
    try {
      const valid = await ctx.runAction(
        internal.discordApplicationWebhooks.receive,
        {
          body,
          signature: request.headers.get("X-Signature-Ed25519") ?? "",
          timestamp: request.headers.get("X-Signature-Timestamp") ?? "",
        }
      )
      return new Response(null, {
        status: valid ? 204 : 401,
        headers: { "Content-Type": "application/json" },
      })
    } catch {
      return new Response(null, { status: 503 })
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

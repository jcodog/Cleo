import { httpRouter } from "convex/server"
import { Webhook } from "svix"

import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"
import { backendEnv } from "@workspace/env/backend"
import { normalizeClerkUserData } from "./lib/clerkUserData"

type ClerkWebhookEvent =
  | {
      type: "user.created" | "user.updated"
      data: unknown
    }
  | {
      type: "user.deleted"
      data: {
        id?: string
      }
    }
  | {
      type: string
      data: unknown
    }

const http = httpRouter()

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
  const webhook = new Webhook(webhookSecret)

  try {
    const event = webhook.verify(payload, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    })

    return isClerkWebhookEvent(event) ? event : null
  } catch {
    return null
  }
}

function isClerkWebhookEvent(value: unknown): value is ClerkWebhookEvent {
  return (
    isObjectRecord(value) &&
    typeof value.type === "string" &&
    "data" in value
  )
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

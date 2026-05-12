import { httpRouter } from "convex/server"
import { Webhook } from "svix"

import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"

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
      await ctx.runMutation(internal.mutations.users.clerk.upsertFromWebhook, {
        data: event.data,
      })
      return new Response(null, { status: 200 })
    }

    const deletedClerkUserId =
      event.type === "user.deleted" ? getDeletedClerkUserId(event.data) : null

    if (deletedClerkUserId) {
      await ctx.runMutation(internal.mutations.users.clerk.deleteFromWebhook, {
        clerkUserId: deletedClerkUserId,
      })
    }

    return new Response(null, { status: 200 })
  }),
})

async function validateClerkWebhook(
  request: Request
): Promise<ClerkWebhookEvent | null> {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET

  if (!webhookSecret) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET")
  }

  const payload = await request.text()
  const webhook = new Webhook(webhookSecret)

  try {
    return webhook.verify(payload, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }) as ClerkWebhookEvent
  } catch {
    return null
  }
}

function getDeletedClerkUserId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) {
    return null
  }

  const id = data.id

  return typeof id === "string" ? id : null
}

export default http

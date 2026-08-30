import { Webhook } from "svix"

export type ClerkWebhookEvent =
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

export function verifyClerkWebhook({
  headers,
  payload,
  secret,
}: {
  headers: Record<string, string>
  payload: string
  secret: string
}): ClerkWebhookEvent | null {
  const webhook = new Webhook(secret)

  try {
    const event = webhook.verify(payload, headers)

    return isClerkWebhookEvent(event) ? event : null
  } catch {
    return null
  }
}

function isClerkWebhookEvent(value: unknown): value is ClerkWebhookEvent {
  return (
    isObjectRecord(value) && typeof value.type === "string" && "data" in value
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

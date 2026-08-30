import assert from "node:assert/strict"
import test from "node:test"

import { Webhook } from "svix"

import { verifyClerkWebhook } from "./clerkWebhook"

const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"

test("accepts a correctly signed Clerk event verified from its raw body", () => {
  const payload = JSON.stringify({
    type: "user.updated",
    data: { id: "user_123" },
  })

  assert.deepEqual(verifyClerkWebhook(sign(payload)), {
    type: "user.updated",
    data: { id: "user_123" },
  })
})

test("rejects malformed verified JSON", () => {
  assert.equal(verifyClerkWebhook(sign("{")), null)
})

test("rejects an invalid signature", () => {
  const signed = sign(JSON.stringify({ type: "user.updated", data: {} }))

  assert.equal(
    verifyClerkWebhook({
      ...signed,
      headers: { ...signed.headers, "svix-signature": "v1,invalid" },
    }),
    null
  )
})

function sign(payload: string) {
  const messageId = "msg_test"
  const timestamp = new Date()
  const webhook = new Webhook(secret)

  return {
    secret,
    payload,
    headers: {
      "svix-id": messageId,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1_000).toString(),
      "svix-signature": webhook.sign(messageId, timestamp, payload),
    },
  }
}

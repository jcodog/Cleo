import assert from "node:assert/strict"
import test from "node:test"

import { Webhook } from "svix"

import { verifyClerkWebhook } from "./clerkWebhook"

const secret = `whsec_${Buffer.from(
  "cleo-clerk-webhook-test-secret-only"
).toString("base64")}`

test("accepts a correctly signed Clerk event verified from its raw body", () => {
  const payload = '{ "type": "user.updated", "data": { "id": "user_123" } }\n'

  assert.deepEqual(verifyClerkWebhook(sign(payload)), {
    type: "user.updated",
    data: { id: "user_123" },
  })
})

test("rejects malformed verified JSON", () => {
  const signed = sign("{")

  assert.doesNotThrow(() =>
    new Webhook(secret).verify(signed.payload, signed.headers)
  )
  assert.equal(verifyClerkWebhook(signed), null)
})

test("rejects verified JSON with an invalid event shape", () => {
  for (const payload of [
    "null",
    "[]",
    "{}",
    '{"type":123,"data":{}}',
    '{"type":"user.updated"}',
  ]) {
    assert.equal(verifyClerkWebhook(sign(payload)), null)
  }
})

test("rejects a changed raw body even when the parsed event is identical", () => {
  const signed = sign('{ "type": "user.updated", "data": {} }')

  assert.equal(
    verifyClerkWebhook({
      ...signed,
      payload: JSON.stringify(JSON.parse(signed.payload)),
    }),
    null
  )
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

test("rejects missing signature headers", () => {
  const signed = sign(JSON.stringify({ type: "user.updated", data: {} }))

  for (const header of ["svix-id", "svix-timestamp", "svix-signature"]) {
    assert.equal(
      verifyClerkWebhook({
        ...signed,
        headers: { ...signed.headers, [header]: "" },
      }),
      null
    )
  }
})

test("rejects correctly signed timestamps outside the replay protection window", () => {
  const payload = JSON.stringify({ type: "user.updated", data: {} })

  for (const offset of [-600_000, 600_000]) {
    assert.equal(
      verifyClerkWebhook(sign(payload, new Date(Date.now() + offset))),
      null
    )
  }
})

function sign(payload: string, timestamp = new Date()) {
  const messageId = "msg_test"
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

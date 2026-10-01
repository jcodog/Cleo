import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"

import { handleTwitchWebhook } from "./twitchWebhook"

const secret = "test-only-twitch-eventsub-secret"
const now = Date.now()
const subscription = {
  id: "test-sub",
  type: "channel.chat.message",
  version: "1",
  condition: { broadcaster_user_id: "222", user_id: "111" },
}

test("verified stream.online webhook validates current contract and persists before acknowledging", async () => {
  const onlineSubscription = {
    ...subscription,
    type: "stream.online",
    condition: { broadcaster_user_id: "222" },
  }
  const event = {
    id: "9001",
    broadcaster_user_id: "222",
    broadcaster_user_login: "Verified_Owner",
    broadcaster_user_name: "Owner",
    type: "live",
    started_at: new Date(now).toISOString(),
  }
  const body = JSON.stringify({ subscription: onlineSubscription, event })
  const received: unknown[] = []
  for (let count = 0; count < 2; count++)
    assert.equal(
      (
        await handleTwitchWebhook(signed(body), secret, now, async (value) => {
          received.push(value)
        })
      ).status,
      204
    )
  assert.deepEqual(received[0], {
    broadcasterId: "222",
    streamId: "9001",
    messageId: "test-message-id",
    login: "verified_owner",
    displayName: "Owner",
    startedAt: event.started_at,
  })
  assert.equal(
    (await handleTwitchWebhook(signed(body), secret, now)).status,
    503
  )
  assert.equal(
    (
      await handleTwitchWebhook(signed(body), secret, now, async () => {
        throw new Error("unavailable")
      })
    ).status,
    503
  )
  for (const patch of [
    { id: "" },
    { broadcaster_user_id: "333" },
    { broadcaster_user_login: "https://bad" },
    { broadcaster_user_name: 1 },
    { type: "unknown" },
    { started_at: "bad" },
  ])
    assert.equal(
      (
        await handleTwitchWebhook(
          signed(
            JSON.stringify({
              subscription: onlineSubscription,
              event: { ...event, ...patch },
            })
          ),
          secret,
          now,
          async () => undefined
        )
      ).status,
      400
    )
  assert.equal(
    (
      await handleTwitchWebhook(
        signed(
          JSON.stringify({
            subscription: onlineSubscription,
            challenge: "online-challenge",
          }),
          { type: "webhook_callback_verification" }
        ),
        secret,
        now
      )
    ).status,
    200
  )
})

function signed(
  body: string,
  options: {
    timestamp?: string
    type?: string
    headers?: Record<string, string>
  } = {}
) {
  const timestamp = options.timestamp ?? new Date(now).toISOString()
  const id = "test-message-id"
  const signature =
    "sha256=" +
    createHmac("sha256", secret)
      .update(id + timestamp)
      .update(body)
      .digest("hex")
  return new Request("https://test.convex.site/twitch-eventsub", {
    method: "POST",
    body,
    headers: {
      "Twitch-Eventsub-Message-Id": id,
      "Twitch-Eventsub-Message-Timestamp": timestamp,
      "Twitch-Eventsub-Message-Signature": signature,
      "Twitch-Eventsub-Message-Type": options.type ?? "notification",
      ...options.headers,
    },
  })
}

test("EventSub verifies exact raw bytes and returns a plain challenge with byte length", async () => {
  const body =
    '{ "subscription": ' +
    JSON.stringify(subscription) +
    ', "challenge": "test-challenge" }\n'
  const response = await handleTwitchWebhook(
    signed(body, { type: "webhook_callback_verification" }),
    secret,
    now
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("Content-Length"), "14")
  assert.match(response.headers.get("Content-Type") ?? "", /text\/plain/)
  assert.equal(await response.text(), "test-challenge")
  const request = signed(body)
  const changed = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(JSON.parse(body)),
  })
  assert.equal((await handleTwitchWebhook(changed, secret, now)).status, 403)
})

test("EventSub acknowledges valid notifications/redelivery and revocation without chat content logs", async () => {
  const logs: string[] = []
  const log = console.log
  const warn = console.warn
  console.log = (value: string) => logs.push(value)
  console.warn = (value: string) => logs.push(value)
  try {
    const body = JSON.stringify({
      subscription,
      event: { message: { text: "test-only-private-chat-content" } },
    })
    assert.equal(
      (await handleTwitchWebhook(signed(body), secret, now)).status,
      204
    )
    assert.equal(
      (await handleTwitchWebhook(signed(body), secret, now)).status,
      204
    )
    assert.equal(
      (
        await handleTwitchWebhook(
          signed(JSON.stringify({ subscription }), { type: "revocation" }),
          secret,
          now
        )
      ).status,
      204
    )
    assert.equal(
      logs.some((line) => line.includes("test-only-private-chat-content")),
      false
    )
  } finally {
    console.log = log
    console.warn = warn
  }
})

test("EventSub rejects invalid signatures, missing headers, stale/future timestamps and absent secret", async () => {
  const body = JSON.stringify({ subscription, event: {} })
  const invalidHeaders: Record<string, string>[] = [
    { "Twitch-Eventsub-Message-Signature": "sha256=" + "0".repeat(64) },
    { "Twitch-Eventsub-Message-Signature": "bad" },
    { "Twitch-Eventsub-Message-Id": "" },
    { "Twitch-Eventsub-Message-Id": "x".repeat(513) },
    { "Twitch-Eventsub-Message-Timestamp": "bad" },
    { "Twitch-Eventsub-Message-Timestamp": "2026-99-99T99:99:99Z" },
  ]
  for (const patch of invalidHeaders)
    assert.equal(
      (await handleTwitchWebhook(signed(body, { headers: patch }), secret, now))
        .status,
      403
    )
  for (const offset of [-600001, 60001])
    assert.equal(
      (
        await handleTwitchWebhook(
          signed(body, { timestamp: new Date(now + offset).toISOString() }),
          secret,
          now
        )
      ).status,
      403
    )
  assert.equal(
    (await handleTwitchWebhook(signed(body), undefined, now)).status,
    503
  )
  assert.equal(
    (await handleTwitchWebhook(signed(body), "short", now)).status,
    503
  )
})

test("EventSub does not trust malformed JSON or subscription/challenge/event shapes", async () => {
  for (const body of [
    "{",
    "null",
    "[]",
    "{}",
    JSON.stringify({ subscription: { ...subscription, type: "other" } }),
    JSON.stringify({ subscription, event: null }),
  ]) {
    assert.equal(
      (await handleTwitchWebhook(signed(body), secret, now)).status,
      400
    )
  }
  for (const challenge of [undefined, "", 123, "x".repeat(4097)])
    assert.equal(
      (
        await handleTwitchWebhook(
          signed(JSON.stringify({ subscription, challenge }), {
            type: "webhook_callback_verification",
          }),
          secret,
          now
        )
      ).status,
      400
    )
  assert.equal(
    (
      await handleTwitchWebhook(
        signed(JSON.stringify({ subscription }), { type: "unknown" }),
        secret,
        now
      )
    ).status,
    400
  )
  assert.equal(
    (
      await handleTwitchWebhook(
        signed("x".repeat(1024 * 1024 + 1)),
        secret,
        now
      )
    ).status,
    413
  )
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { createHmac } from "node:crypto"
import { resolve } from "node:path"
import { TwitchClient } from "./TwitchClient"
import { runtimeEnv, silentLogger, json } from "../../tests/fixtures"

test("signed chat reaches shared moderation, respects badges, emote spans, cache and enforcement gates", async () => {
  const config = {
    ...runtimeEnv(resolve("unused-grant"), resolve("unused-state")),
    TWITCH_MODERATION_ENFORCEMENT_ENABLED: "true",
  }
  const calls: { path: string; args: Record<string, unknown> }[] = []
  const logs: unknown[] = []
  let reject = false
  const request: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    calls.push(body)
    if (body.path === "moderationActions:enforceTwitch" && reject)
      throw new Error("provider unavailable")
    return json({
      status: "success",
      value:
        body.path === "moderationActions:runtime"
          ? {
              revision: 1,
              policyJSON: JSON.stringify({
                revision: 1,
                rules: {
                  blockedWords: {
                    enabled: true,
                    entries: [{ term: "bad" }],
                    action: { kind: "delete" },
                  },
                  emojiSpam: {
                    enabled: true,
                    maximum: 1,
                    action: { kind: "delete" },
                  },
                },
              }),
              enforcement: true,
              authorityUntil: Date.now() + 60000,
              leaseDurationMs: 60000,
            }
          : null,
    })
  }
  const client = new TwitchClient(
    config,
    {
      ...silentLogger,
      info: (...args) => {
        logs.push(args)
      },
    },
    request
  )
  let serial = 0
  async function send(
    chatter = "333",
    text = "bad",
    badges: { set_id: string }[] | null = [],
    fragments: { type: string; text: string }[] | null = [
      { type: "text", text },
    ],
    messageId?: string
  ) {
    const id = `event-${++serial}`,
      timestamp = new Date().toISOString()
    const body = JSON.stringify({
      subscription: {
        id: "sub",
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: "222",
          user_id: config.TWITCH_BOT_USER_ID,
        },
      },
      event: {
        broadcaster_user_id: "222",
        broadcaster_user_login: "channel",
        broadcaster_user_name: "Channel",
        chatter_user_id: chatter,
        message_id: messageId ?? id,
        badges: badges ?? undefined,
        message: { text, fragments: fragments ?? undefined },
      },
    })
    const response = await client.webhook.handle(
      new Request("https://test.example/eventsub", {
        method: "POST",
        body,
        headers: {
          "Twitch-Eventsub-Message-Id": id,
          "Twitch-Eventsub-Message-Timestamp": timestamp,
          "Twitch-Eventsub-Message-Type": "notification",
          "Twitch-Eventsub-Message-Signature": `sha256=${createHmac(
            "sha256",
            config.TWITCH_EVENTSUB_SECRET
          )
            .update(id + timestamp + body)
            .digest("hex")}`,
        },
      })
    )
    assert.equal(response.status, 204)
    await client.webhook.drain()
  }
  await send(config.TWITCH_BOT_USER_ID)
  assert.equal(calls.length, 0)
  await send("222")
  await send("333", "bad", [{ set_id: "moderator" }])
  await send("333", "hello")
  await send("333", "bad", [], [{ type: "text", text: "mismatch" }])
  assert.equal(calls.filter((c) => c.path.endsWith("enforceTwitch")).length, 0)
  await send("333", "bad", [], undefined, "duplicate")
  await send("333", "bad", [], undefined, "duplicate")
  await send(
    "333",
    "KappaKappa",
    [],
    [
      { type: "emote", text: "Kappa" },
      { type: "emote", text: "Kappa" },
    ]
  )
  reject = true
  await send()
  assert.equal(calls.filter((c) => c.path.endsWith("runtime")).length, 1)
  assert.equal(calls.filter((c) => c.path.endsWith("enforceTwitch")).length, 3)
  assert.ok(!JSON.stringify(logs).includes("Kappa"))
  config.TWITCH_MODERATION_ENFORCEMENT_ENABLED = "false"
  await send()
  await send("333", "bad", null, null)
  assert.equal(calls.filter((c) => c.path.endsWith("enforceTwitch")).length, 3)
})

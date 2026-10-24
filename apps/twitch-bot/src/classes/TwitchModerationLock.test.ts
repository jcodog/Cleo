import assert from "node:assert/strict"
import { test } from "node:test"
import { resolve } from "node:path"
import { createHmac } from "node:crypto"
import { TwitchClient } from "./TwitchClient"
import { ModerationRuntime } from "@workspace/shared/moderationRuntime"
import { runtimeEnv, silentLogger } from "../../tests/fixtures"

test("release-locked signed Twitch chat never loads or inspects moderation policy", async (t) => {
  const load = t.mock.method(
    ModerationRuntime.prototype,
    "load",
    async () => {}
  )
  const inspect = t.mock.method(
    ModerationRuntime.prototype,
    "inspect",
    () => null
  )
  let requests = 0
  const config = {
    ...runtimeEnv(resolve("unused-grant"), resolve("unused-state")),
    TWITCH_MODERATION_ENFORCEMENT_ENABLED: "true",
  }
  const client = new TwitchClient(config, silentLogger, async () => {
    requests++
    throw new Error("No backend request is allowed")
  })
  const timestamp = new Date().toISOString(),
    id = "locked-chat"
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
      chatter_user_id: "333",
      message_id: "message",
      message: { text: "bad" },
    },
  })
  assert.equal(
    (
      await client.webhook.handle(
        new Request("http://localhost/eventsub", {
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
    ).status,
    204
  )
  await client.webhook.drain()
  assert.equal(load.mock.callCount(), 0)
  assert.equal(inspect.mock.callCount(), 0)
  assert.equal(requests, 0)
})

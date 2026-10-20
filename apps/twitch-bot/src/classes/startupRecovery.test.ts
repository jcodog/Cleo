import assert from "node:assert/strict"
import { test } from "node:test"
import { join } from "node:path"
import { TwitchClient } from "./TwitchClient"
import { createGrant } from "../auth/grantStore"
import {
  withGrant,
  runtimeEnv,
  runtimeHttp,
  silentLogger,
  botToken,
  apiConfig,
} from "../../tests/fixtures"

test(
  "real client startup recovers a durable announcement after the actual 30-second send defer",
  { timeout: 45000 },
  async () => {
    await withGrant(async (store, directory) => {
      await store.write(createGrant(botToken, apiConfig))
      const controller = new AbortController()
      const startedAt = Date.now()
      const outcomes: boolean[] = []
      let attemptedAt = 0
      const fallback = runtimeHttp()
      const request: typeof fetch = async (input, init) => {
        if (String(input).endsWith("/api/action")) {
          const body = JSON.parse(String(init?.body))
          const path: string = body.path
          let value: unknown = null
          if (path.endsWith(":pendingEvents"))
            value = {
              events: outcomes.length
                ? []
                : [
                    {
                      messageId: "recovery",
                      key: "follow",
                      broadcasterId: "222",
                      eventJson: JSON.stringify({
                        broadcaster_user_id: "222",
                        broadcaster_user_login: "channel",
                        broadcaster_user_name: "Channel",
                        user_name: "Viewer",
                      }),
                    },
                  ],
              cursor: null,
            }
          else if (path.endsWith(":reserveEvent")) value = { kind: "pending" }
          else if (path.endsWith(":beginDispatch")) value = true
          else if (path.endsWith(":finishDispatch")) {
            outcomes.push(body.args.sent)
            controller.abort()
          } else if (path.endsWith(":page"))
            value = { groups: [], cursor: null, startedAt: Date.now() }
          return Response.json({ status: "success", value })
        }
        if (String(input).endsWith("/chat/messages")) {
          attemptedAt = Date.now()
          return Response.json({
            data: [{ message_id: "confirmed", is_sent: true }],
          })
        }
        return fallback(input, init)
      }
      const client = new TwitchClient(
        {
          ...runtimeEnv(store.path, join(directory, "readiness.json")),
          TWITCH_WEBHOOK_PORT: 0,
        },
        silentLogger,
        request
      )
      await client.run(controller.signal)
      assert.ok(attemptedAt - startedAt >= 30000)
      assert.deepEqual(outcomes, [true])
      assert.equal(client.webhook.isListening, false)
    })
  }
)

test(
  "SIGTERM bounds stalled accepted work and preserves its grace before aborting resources",
  { timeout: 5000 },
  async (t) => {
    await withGrant(async (store, directory) => {
      await store.write(createGrant(botToken, apiConfig))
      const controller = new AbortController(),
        signals: AbortSignal[] = []
      let release: () => void = () => {},
        ready = false,
        reportReady: () => void = () => {}
      const readiness = new Promise<void>((resolve) => {
        reportReady = resolve
      })
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const fallback = runtimeHttp()
      const client = new TwitchClient(
        {
          ...runtimeEnv(store.path, join(directory, "state.json")),
          TWITCH_WEBHOOK_PORT: 0,
        },
        {
          ...silentLogger,
          info: (message) => {
            if (message === "Twitch runtime ready") {
              ready = true
              controller.abort()
              reportReady()
            }
          },
        },
        async (input, init) => {
          if (init?.signal) signals.push(init.signal)
          return fallback(input, init)
        }
      )
      const stop = client.webhook.stop.bind(client.webhook)
      t.mock.method(client.webhook, "stop", async () => {
        await stop()
        await held
      })
      t.mock.timers.enable({ apis: ["setTimeout"] })
      t.after(() => {
        release()
        t.mock.timers.reset()
      })
      const running = client.run(controller.signal)
      await readiness
      assert.equal(ready, true)
      assert.equal(signals.at(-1)?.aborted, false)
      t.mock.timers.tick(15000)
      await running
      assert.equal(signals.at(-1)?.aborted, true)
      assert.equal(client.webhook.isListening, false)
      release()
      t.mock.timers.reset()
    })
  }
)

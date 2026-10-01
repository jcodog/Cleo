import assert from "node:assert/strict"
import { test } from "node:test"

import { TwitchApi } from "./api"
import {
  apiConfig,
  desiredSubscription,
  httpFake,
  json,
  subscription,
} from "../tests/fixtures"
import { reconcileChatSubscription } from "./subscriptions"

test("healthy subscription is reused, duplicates/stale entries removed only for configured channel/bot", async () => {
  const deletes: string[] = []
  const api = new TwitchApi(
    apiConfig,
    httpFake((url, init) => {
      if (init.method === "DELETE") {
        deletes.push(url.searchParams.get("id") ?? "")
        return new Response(null, { status: 204 })
      }
      assert.notEqual(init.method, "POST")
      return json({
        data: [
          subscription,
          { ...subscription, id: "duplicate" },
          { ...subscription, id: "stale", status: "authorization_revoked" },
          {
            ...subscription,
            id: "other",
            condition: { broadcaster_user_id: "333", user_id: "111" },
          },
        ],
      })
    })
  )
  assert.deepEqual(
    await reconcileChatSubscription(api, "test-only-app", desiredSubscription),
    { status: "ready", subscriptionId: "test-sub" }
  )
  assert.deepEqual(deletes, ["duplicate", "stale"])
})

test("missing subscription creates once and pending verification does not become ready", async () => {
  let exists = false
  let creates = 0
  const api = new TwitchApi(
    apiConfig,
    httpFake((_url, init) => {
      if (init.method === "POST") {
        creates++
        exists = true
        return json(
          {
            data: [
              {
                ...subscription,
                status: "webhook_callback_verification_pending",
              },
            ],
          },
          202
        )
      }
      return json({
        data: exists
          ? [
              {
                ...subscription,
                status: "webhook_callback_verification_pending",
              },
            ]
          : [],
      })
    })
  )
  assert.deepEqual(
    await reconcileChatSubscription(api, "test-only-app", desiredSubscription),
    { status: "pending" }
  )
  assert.deepEqual(
    await reconcileChatSubscription(api, "test-only-app", desiredSubscription),
    { status: "pending" }
  )
  assert.equal(creates, 1)
})

test("failed subscription is replaced, concurrent conflict re-lists and other failures propagate", async () => {
  let deleted = false
  const api = new TwitchApi(
    apiConfig,
    httpFake((_url, init) => {
      if (init.method === "DELETE") {
        deleted = true
        return new Response(null, { status: 204 })
      }
      if (init.method === "POST") return json({}, 409)
      return json({
        data: [
          { ...subscription, status: "webhook_callback_verification_failed" },
        ],
      })
    })
  )
  assert.deepEqual(
    await reconcileChatSubscription(api, "test-only-app", desiredSubscription),
    { status: "pending" }
  )
  assert.equal(deleted, true)
  for (const status of [401, 403, 500])
    await assert.rejects(
      reconcileChatSubscription(
        new TwitchApi(
          apiConfig,
          httpFake((_url, init) =>
            init.method === "POST" ? json({}, status) : json({ data: [] })
          )
        ),
        "test-only-app",
        desiredSubscription
      )
    )
  await assert.rejects(
    reconcileChatSubscription(
      new TwitchApi(
        apiConfig,
        httpFake(() => {
          throw new Error("unavailable")
        })
      ),
      "test-only-app",
      desiredSubscription
    )
  )
})

test("callback mismatch fails safely instead of deleting another ingress subscription", async () => {
  await assert.rejects(
    reconcileChatSubscription(
      new TwitchApi(
        apiConfig,
        httpFake(() =>
          json({
            data: [
              {
                ...subscription,
                transport: {
                  method: "webhook",
                  callback: "https://other.convex.site/twitch-eventsub",
                },
              },
            ],
          })
        )
      ),
      "test-only-app",
      desiredSubscription
    ),
    /subscriptionUnavailable/
  )
})

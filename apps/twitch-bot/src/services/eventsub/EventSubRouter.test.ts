import assert from "node:assert/strict"
import { test } from "node:test"
import { renderTemplate } from "@workspace/shared/twitchEventSub"
import { EventSubRouter, routes } from "./EventSubRouter"
import { AnnouncementService } from "../announcements/AnnouncementService"
import { silentLogger } from "../../../tests/fixtures"

const payload = {
  broadcaster_user_id: "222",
  broadcaster_user_login: "channel",
  broadcaster_user_name: "Channel",
  user_name: "Viewer",
  tier: "1000",
  is_gift: false,
  cumulative_months: 12,
  total: 5,
  cumulative_total: 25,
  is_anonymous: false,
  bits: 100,
  viewers: 42,
  to_broadcaster_user_id: "222",
  to_broadcaster_user_name: "Channel",
  from_broadcaster_user_name: "Raider",
  level: 3,
  charity_name: "Charity",
  amount: { value: 1234, decimal_places: 2, currency: "USD" },
  id: "9001",
  started_at: "2026-10-01T12:00:00Z",
  type: "live",
  chatter_user_id: "333",
  message_id: "chat",
  message: { text: "do not echo me" },
}
test("all typed handlers send locally except stream.online; gifted recipient and viewer chat are suppressed", async () => {
  const sent: { broadcaster: string; message: string }[] = []
  const streams: unknown[] = []
  const router = new EventSubRouter(
    {
      announcements: {
        send: async (broadcaster, def, values, template) => {
          sent.push({
            broadcaster,
            message: renderTemplate(def, values, template),
          })
        },
      },
      convex: {
        streamOnline: async (id, event) => {
          streams.push({ id, event })
        },
      },
    },
    silentLogger
  )
  for (const route of routes)
    await router.dispatch(route.parse(payload), route.key, "event-id")
  assert.equal(sent.length, 9)
  assert.equal(streams.length, 1)
  assert.ok(sent.every((message) => message.broadcaster === "222"))
  assert.match(sent[0]!.message, /Thanks for the follow, Viewer/)
  assert.match(sent[2]!.message, /12 months/)
  assert.match(sent[3]!.message, /5 subs.*25 gifted/)
  const sub = routes.find((route) => route.key === "subscribe")!
  await router.dispatch(
    sub.parse({ ...payload, is_gift: true }),
    sub.key,
    "gifted-recipient"
  )
  assert.equal(sent.length, 9)
  for (const key of ["subscriptionGift", "cheer"] as const) {
    const route = routes.find((route) => route.key === key)!
    await router.dispatch(
      route.parse({ ...payload, is_anonymous: true, cumulative_total: null }),
      key,
      "anonymous"
    )
    assert.match(sent.at(-1)!.message, /An anonymous viewer/)
    assert.doesNotMatch(sent.at(-1)!.message, /Viewer|gifted in total/)
  }
  const follow = routes.find((route) => route.key === "follow")!
  await router.dispatch(
    follow.parse(payload),
    "follow",
    "custom",
    "Welcome {user} to {channel}!"
  )
  assert.equal(sent.at(-1)!.message, "Welcome Viewer to Channel!")
  assert.throws(() => follow.parse({ broadcaster_user_id: "bad" }))
})
test("announcement service renders plain outbound text with the dedicated bot app token", async () => {
  const sent: unknown[] = []
  const service = new AnnouncementService(
    {
      sendChatMessage: async (...args) => {
        sent.push(args)
        return "message"
      },
    },
    { appToken: async () => "app-token" },
    silentLogger
  )
  await service.send(
    "222",
    { defaultTemplate: "Hello {user}", allowedTemplateTags: ["user"] },
    { user: "Viewer\nName" }
  )
  assert.deepEqual(sent, [["app-token", "222", "Hello Viewer Name"]])
  await service.send(
    "222",
    { defaultTemplate: "Hello {user}", allowedTemplateTags: ["user"] },
    { user: "Viewer" },
    undefined,
    async () => false
  )
  assert.equal(sent.length, 1)
  await service.send(
    "222",
    { defaultTemplate: "Hello {user}", allowedTemplateTags: ["user"] },
    { user: "Viewer" },
    undefined,
    async () => true
  )
  assert.equal(sent.length, 2)
})

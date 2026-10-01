import assert from "node:assert/strict"
import { test } from "node:test"
import {
  eventDefinitions,
  announcementKeys,
  isAnnouncementKey,
  isEventKey,
  resolveBroadcasterScopes,
  subscriptionIdentity,
  validateTemplate,
  renderTemplate,
  previewTemplate,
  normalizeChatText,
  formatCharityAmount,
  ANONYMOUS_USER,
} from "./twitchEventSub"

const broadcaster = {
  broadcaster_user_id: "222",
  broadcaster_user_login: "channel",
  broadcaster_user_name: "Channel",
}
const common = {
  ...broadcaster,
  user_name: "Viewer",
  tier: "1000" as const,
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
}
test("every announcement shares defaults, strict tags, sample previews and typed payload mapping", () => {
  for (const key of announcementKeys) {
    const definition = eventDefinitions[key]
    assert.equal(definition.key, key)
    assert.equal(definition.handler, key)
    definition.parse(common)
    const values = definition.values(common)
    assert.ok(renderTemplate(definition, values))
    assert.ok(previewTemplate(key))
    assert.equal(validateTemplate(key, definition.defaultTemplate), undefined)
    for (const tag of definition.allowedTemplateTags) {
      assert.equal(renderTemplate(definition, values, `{${tag}}`), values[tag])
      assert.ok(previewTemplate(key, `{${tag}}`))
      assert.ok(definition.tags[tag as keyof typeof definition.tags])
    }
    assert.throws(() => validateTemplate(key, "{unknown}"), /Unsupported/)
  }
  assert.equal(
    renderTemplate(
      eventDefinitions.resubscribe,
      eventDefinitions.resubscribe.values(
        eventDefinitions.resubscribe.parse(common)
      )
    ),
    "Viewer just resubscribed for 12 months! 💜"
  )
  assert.match(
    renderTemplate(
      eventDefinitions.cheer,
      eventDefinitions.cheer.values(eventDefinitions.cheer.parse(common))
    ),
    /100 Bits/
  )
  assert.match(
    renderTemplate(
      eventDefinitions.raid,
      eventDefinitions.raid.values(eventDefinitions.raid.parse(common))
    ),
    /Raider raided with 42 viewers/
  )
  assert.match(
    renderTemplate(
      eventDefinitions.hypeTrainEnd,
      eventDefinitions.hypeTrainEnd.values(
        eventDefinitions.hypeTrainEnd.parse(common)
      )
    ),
    /level 3 with 5 contribution points/
  )
  assert.match(
    renderTemplate(
      eventDefinitions.charityDonation,
      eventDefinitions.charityDonation.values(
        eventDefinitions.charityDonation.parse(common)
      )
    ),
    /\$12.34 to Charity/
  )
})
test("custom templates and reset do safe token replacement with no execution", () => {
  const def = eventDefinitions.follow
  const values = def.values(def.parse(common))
  const custom = validateTemplate("follow", "YO {user}! Welcome in 💜")
  assert.equal(renderTemplate(def, values, custom), "YO Viewer! Welcome in 💜")
  assert.equal(
    renderTemplate(
      def,
      values,
      validateTemplate("follow", def.defaultTemplate)
    ),
    "Thanks for the follow, Viewer! 💜"
  )
  for (const source of [
    "{bits}",
    "{user.name}",
    "{user",
    "user}",
    "{{user}}",
    "{user + 1}",
    "{1}",
    " \n ",
    "x".repeat(401),
  ])
    assert.throws(() => validateTemplate("follow", source))
  assert.equal(validateTemplate("follow", "x".repeat(400)), "x".repeat(400))
  assert.equal(validateTemplate("follow", "hi\n\t{user}\0"), "hi {user}")
  assert.equal(
    normalizeChatText("a\x7fb\u0080c\u200bd\u202ae\u2066f\ufeffg\ud800h"),
    "a b c d e f g h"
  )
  assert.equal(
    renderTemplate(
      def,
      { user: "{bits}\nViewer", channel: "Channel" },
      "{user}"
    ),
    "{bits} Viewer"
  )
  assert.throws(() => renderTemplate(def, values, "{unknown}"))
  assert.throws(() => renderTemplate(def, values, "{user.name}"))
  assert.throws(() => renderTemplate(def, {}, "{user}"))
  const long = { user: "U".repeat(100), channel: "Channel" }
  assert.equal(
    renderTemplate(def, long, "{user}".repeat(10)),
    renderTemplate(def, long)
  )
  assert.equal(renderTemplate(def, values, "x".repeat(500)), "x".repeat(500))
  assert.equal(
    renderTemplate(def, values, "x".repeat(501)),
    renderTemplate(def, values)
  )
  assert.throws(
    () => renderTemplate(def, { ...long, user: "U".repeat(501) }),
    /Default message/
  )
})
test("anonymous events and missing cumulative gifts never invent identity or numbers", () => {
  const gift = eventDefinitions.subscriptionGift
  const cheer = eventDefinitions.cheer
  for (const is_anonymous of [true, false]) {
    for (const user_name of ["Identity", null, undefined]) {
      const values = gift.values(
        gift.parse({
          ...common,
          is_anonymous,
          user_name,
          cumulative_total: null,
        })
      )
      assert.equal(
        values.user,
        is_anonymous || user_name == null ? ANONYMOUS_USER : user_name
      )
      assert.equal(values.total, "not available")
      assert.equal(
        renderTemplate(gift, values),
        `${values.user} gifted 5 subs! 💜`
      )
      assert.equal(
        renderTemplate(gift, values, "{user}: {total}"),
        `${values.user}: not available`
      )
      assert.equal(
        cheer.values(cheer.parse({ ...common, is_anonymous, user_name })).user,
        values.user
      )
    }
  }
  assert.equal(
    renderTemplate(gift, gift.values(gift.parse(common))),
    "Viewer gifted 5 subs! That's 25 gifted in total! 💜"
  )
})
test("registry is the single event/version/scope/condition contract", () => {
  assert.deepEqual(resolveBroadcasterScopes([]), ["channel:bot"])
  assert.deepEqual(resolveBroadcasterScopes([...announcementKeys]), [
    "channel:bot",
    "moderator:read:followers",
    "channel:read:subscriptions",
    "bits:read",
    "channel:read:hype_train",
    "channel:read:charity",
  ])
  assert.equal(eventDefinitions.follow.version, "2")
  assert.equal(eventDefinitions.hypeTrainBegin.version, "2")
  assert.equal(eventDefinitions.hypeTrainEnd.version, "2")
  assert.deepEqual(eventDefinitions.follow.condition("222", "111"), {
    broadcaster_user_id: "222",
    moderator_user_id: "222",
  })
  assert.deepEqual(eventDefinitions.chatMessage.condition("222", "111"), {
    broadcaster_user_id: "222",
    user_id: "111",
  })
  assert.deepEqual(eventDefinitions.raid.condition("222", "111"), {
    to_broadcaster_user_id: "222",
  })
  assert.deepEqual(eventDefinitions.streamOnline.condition("222", "111"), {
    broadcaster_user_id: "222",
  })
  assert.equal(
    eventDefinitions.chatMessage.parse({
      ...broadcaster,
      chatter_user_id: "333",
      message_id: "msg",
      message: { text: "hello" },
    }).message.text,
    "hello"
  )
  assert.equal(
    eventDefinitions.streamOnline.parse({
      ...broadcaster,
      id: "123",
      started_at: "2026-10-01T12:00:00Z",
      type: "live",
    }).id,
    "123"
  )
  assert.ok(isEventKey("streamOnline"))
  assert.ok(!isEventKey("toString"))
  assert.ok(!isEventKey("host"))
  assert.ok(isAnnouncementKey("follow"))
  assert.ok(!isAnnouncementKey("streamOnline"))
  assert.equal(
    subscriptionIdentity(
      "streamOnline",
      "222",
      "111",
      "https://example.com/eventsub"
    ),
    subscriptionIdentity(
      "streamOnline",
      "222",
      "different-bot",
      "https://example.com/eventsub"
    )
  )
  assert.notEqual(
    subscriptionIdentity(
      "streamOnline",
      "222",
      "111",
      "https://example.com/eventsub"
    ),
    subscriptionIdentity(
      "streamOnline",
      "222",
      "111",
      "https://other.example/eventsub"
    )
  )
})
test("currency values use Twitch decimal representation including zero and nonstandard precision", () => {
  assert.equal(
    formatCharityAmount({ value: 1234, decimal_places: 2, currency: "USD" }),
    "$12.34"
  )
  assert.equal(
    formatCharityAmount({ value: 1234, decimal_places: 0, currency: "JPY" }),
    "¥1,234"
  )
  assert.equal(
    formatCharityAmount({ value: 1234, decimal_places: 3, currency: "USD" }),
    "$1.234"
  )
})

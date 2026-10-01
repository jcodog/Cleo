import assert from "node:assert/strict"
import { test } from "node:test"
import { MessageFlags } from "discord.js"
import { buildTwitchLiveCard, type TwitchLiveCard } from "./twitchLiveCard"
const view: TwitchLiveCard = {
  deliveryId: "delivery",
  login: "jconet",
  displayName: "JCoNet",
  title: "COD & Bad Decisions @everyone <@123>",
  category: "Call of Duty",
  startedAt: "2026-10-01T12:00:00Z",
  avatarUrl: "https://static-cdn.jtvnw.net/avatar.png",
  previewUrl: "https://static-cdn.jtvnw.net/preview-{width}x{height}.jpg",
  viewerCount: 12,
  mentionMode: "everyone",
}
test("live card uses a purple Components V2 container, avatar, large preview and factual metadata", () => {
  const card = buildTwitchLiveCard(view)
  assert.equal(card.flags, MessageFlags.IsComponentsV2)
  assert.equal("embeds" in card, false)
  assert.equal(card.components.length, 2)
  const json = JSON.stringify(card)
  assert.match(json, /JCoNet is live on Twitch/)
  assert.match(json, /Playing Call of Duty/)
  assert.match(json, /12 viewers/)
  assert.match(json, /Started <t:1790856000:R>/)
  assert.match(json, /640x360/)
  assert.match(json, /avatar\.png/)
  assert.match(json, /Watch on Twitch ↗/)
  assert.match(json, /"accent_color":9520895/)
  assert.deepEqual(card.allowed_mentions, {
    parse: ["everyone"],
    roles: [],
    users: [],
    replied_user: false,
  })
  assert.equal(card.enforce_nonce, true)
  assert.equal(card.nonce, buildTwitchLiveCard(view).nonce)
  assert.notEqual(
    card.nonce,
    buildTwitchLiveCard({ ...view, deliveryId: "another" }).nonce
  )
  assert.ok(json.includes("@\u200beveryone"))
  assert.ok(json.includes("‹@\u200b123›"))
})
test("missing media, title, category, viewer count or invalid time degrades without embeds or invented metadata", () => {
  const json = JSON.stringify(
    buildTwitchLiveCard({
      ...view,
      avatarUrl: undefined,
      previewUrl: undefined,
      viewerCount: undefined,
      title: undefined,
      category: undefined,
      startedAt: "invalid",
      mentionMode: "none",
    })
  )
  assert.doesNotMatch(
    json,
    /Started|viewers|Playing|"media"|"accessory"|@everyone/
  )
  for (const avatarUrl of [
    "not a URL",
    "http://static-cdn.jtvnw.net/image.png",
    "https://user:pass@static-cdn.jtvnw.net/image.png",
    "https://evil.example/image.png",
  ])
    assert.doesNotMatch(
      JSON.stringify(
        buildTwitchLiveCard({ ...view, avatarUrl, previewUrl: avatarUrl })
      ),
      /"accessory"|"media"/
    )
  assert.doesNotMatch(
    JSON.stringify(buildTwitchLiveCard({ ...view, viewerCount: -1 })),
    /-1 viewers/
  )
  assert.doesNotMatch(
    JSON.stringify(buildTwitchLiveCard({ ...view, viewerCount: 1.5 })),
    /1.5 viewers/
  )
  const role = buildTwitchLiveCard({
    ...view,
    mentionMode: "role",
    roleId: "123456789012345678",
  })
  assert.deepEqual(role.allowed_mentions, {
    parse: [],
    roles: ["123456789012345678"],
    users: [],
    replied_user: false,
  })
  for (const roleId of [undefined, "invalid"])
    assert.throws(() =>
      buildTwitchLiveCard({ ...view, mentionMode: "role", roleId })
    )
  assert.throws(() => buildTwitchLiveCard({ ...view, login: "bad/url" }))
  const untrusted = JSON.stringify(
    buildTwitchLiveCard({
      ...view,
      title: "safe\u061cevil\u202espoof\u206f",
      displayName: "Name\u2066",
      category: "Game\u200f",
    })
  )
  assert.doesNotMatch(
    untrusted,
    /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/
  )
  assert.doesNotMatch(
    JSON.stringify(buildTwitchLiveCard({ ...view, title: "A\0B\u0085C\nD" })),
    /\\u0000|\\u0085/
  )
})

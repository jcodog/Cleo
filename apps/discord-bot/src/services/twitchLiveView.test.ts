import assert from "node:assert/strict"
import { test } from "node:test"
import { MessageFlags } from "discord.js"
import { buildTwitchLiveView } from "./twitchLiveView"

const base = {
  deliveryId: "delivery-one",
  login: "verified_owner",
  displayName: "Owner @everyone <@123456789012345678>",
  startedAt: "2026-10-01T15:00:00Z",
}

test("live notification uses Components V2 and safe verified Twitch link without legacy embeds", () => {
  const message = buildTwitchLiveView({
    ...base,
    mentionMode: "none",
    title: "@everyone <@&123456789012345678> **title**\nnext",
    category: "Game @here",
  })
  assert.equal(message.flags, MessageFlags.IsComponentsV2)
  assert.equal(message.embeds, undefined)
  assert.equal(message.content, undefined)
  assert.deepEqual(message.allowedMentions, {
    parse: [],
    roles: [],
    users: [],
    repliedUser: false,
  })
  const json = JSON.stringify(message.components)
  assert.match(json, /https:\/\/www.twitch.tv\/verified_owner/)
  assert.match(json, /Watch stream/)
  assert.match(json, /LIVE/)
  assert.equal(json.includes("@everyone"), false)
  assert.equal(json.includes("<@"), false)
  assert.equal(message.enforceNonce, true)
  assert.equal(
    message.nonce,
    buildTwitchLiveView({ ...base, mentionMode: "none" }).nonce
  )
  assert.notEqual(
    message.nonce,
    buildTwitchLiveView({
      ...base,
      deliveryId: "new-session",
      mentionMode: "none",
    }).nonce
  )
})

test("mentions allow only intentional everyone or one configured role", () => {
  const everyone = buildTwitchLiveView({
    ...base,
    mentionMode: "everyone",
    title: "@everyone @here <@&234567890123456789>",
  })
  assert.deepEqual(everyone.allowedMentions, {
    parse: ["everyone"],
    roles: [],
    users: [],
    repliedUser: false,
  })
  assert.equal(
    JSON.stringify(everyone.components).match(/@everyone/g)?.length,
    1
  )
  const role = buildTwitchLiveView({
    ...base,
    mentionMode: "role",
    roleId: "234567890123456789",
  })
  assert.deepEqual(role.allowedMentions, {
    parse: [],
    roles: ["234567890123456789"],
    users: [],
    repliedUser: false,
  })
  assert.match(JSON.stringify(role.components), /<@&234567890123456789>/)
  assert.throws(
    () => buildTwitchLiveView({ ...base, mentionMode: "role" }),
    /role/
  )
  assert.throws(
    () => buildTwitchLiveView({ ...base, mentionMode: "role", roleId: "123" }),
    /role/
  )
  assert.throws(
    () =>
      buildTwitchLiveView({ ...base, login: "bad/url", mentionMode: "none" }),
    /login/
  )
})

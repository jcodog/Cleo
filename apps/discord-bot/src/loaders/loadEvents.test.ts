import assert from "node:assert/strict"
import { test } from "node:test"

import { Events } from "discord.js"

import { loadEvents } from "./loadEvents"

test("loaded events register the current gateway event surface once", async () => {
  const events = await loadEvents()
  const eventNames = events.map((event) => event.name)

  assert.equal(new Set(eventNames).size, eventNames.length)
  assert.deepEqual(new Set(eventNames), new Set([
    Events.ClientReady,
    Events.InteractionCreate,
    Events.GuildCreate,
    Events.GuildDelete,
    Events.GuildMemberAdd,
    Events.GuildMemberRemove,
    Events.GuildBanAdd,
    Events.GuildBanRemove,
    Events.ChannelCreate,
    Events.ChannelDelete,
    Events.GuildRoleCreate,
    Events.GuildRoleDelete,
    Events.MessageDelete,
  ]))
})

test("clientReady is the only once event", async () => {
  const events = await loadEvents()

  for (const event of events) {
    assert.equal(event.once, event.name === Events.ClientReady)
    assert.equal(typeof event.execute, "function")
  }
})

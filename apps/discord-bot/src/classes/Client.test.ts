import assert from "node:assert/strict"
import { test } from "node:test"

import { Events } from "discord.js"

import { Event } from "./Event"
import { BotClient } from "./Client"
import { loadEvents, type LoadedEvent } from "../loaders/loadEvents"

type LoadedEventRegistrar = {
  registerLoadedEvent: (event: LoadedEvent) => void
}

function registerLoadedEvent(client: BotClient, event: LoadedEvent): void {
  const registrar = client as unknown as LoadedEventRegistrar

  registrar.registerLoadedEvent(event)
}

test("loaded events attach listeners before they are logged as registered", async () => {
  const client = new BotClient()
  const events = await loadEvents()

  for (const event of events) {
    assert.equal(client.listenerCount(event.name), 0)

    registerLoadedEvent(client, event)

    assert.equal(client.listenerCount(event.name), 1)
  }
})

test("unsupported loaded event names fail loudly", () => {
  const client = new BotClient()
  const unsupportedEvent = new Event({
    name: Events.GuildMemberAdd,
    execute() {
      return undefined
    },
  })

  assert.throws(
    () => registerLoadedEvent(client, unsupportedEvent as unknown as LoadedEvent),
    /Unsupported loaded event: guildMemberAdd/
  )
})

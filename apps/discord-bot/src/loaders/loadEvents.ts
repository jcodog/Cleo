import clientReady from "@workspace/discord-bot/handlers/events/clientReady"
import guildCreate from "@workspace/discord-bot/handlers/events/guildCreate"
import guildDelete from "@workspace/discord-bot/handlers/events/guildDelete"
import interactionCreate from "@workspace/discord-bot/handlers/events/interactionCreate"

const loadedEvents = [
  clientReady,
  interactionCreate,
  guildCreate,
  guildDelete,
] as const

export type LoadedEvent = (typeof loadedEvents)[number]

export async function loadEvents(): Promise<LoadedEvent[]> {
  return [...loadedEvents]
}

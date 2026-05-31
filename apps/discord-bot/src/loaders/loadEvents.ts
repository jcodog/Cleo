import type { Event } from "@workspace/discord-bot/classes/Event"
import clientReady from "@workspace/discord-bot/handlers/events/clientReady"
import guildCreate from "@workspace/discord-bot/handlers/events/guildCreate"
import guildDelete from "@workspace/discord-bot/handlers/events/guildDelete"
import interactionCreate from "@workspace/discord-bot/handlers/events/interactionCreate"

export async function loadEvents(): Promise<Event<any>[]> {
  return [clientReady, interactionCreate, guildCreate, guildDelete]
}

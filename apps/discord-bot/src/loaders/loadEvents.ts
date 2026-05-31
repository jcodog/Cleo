import type { Event } from "@workspace/discord-bot/classes/Event"
import clientReadyEvent from "@workspace/discord-bot/handlers/events/clientReady"
import interactionCreateEvent from "@workspace/discord-bot/handlers/events/interactionCreate"

export async function loadEvents(): Promise<Event<any>[]> {
  return [clientReadyEvent, interactionCreateEvent]
}

import clientReady from "@/handlers/events/clientReady"
import guildCreate from "@/handlers/events/guildCreate"
import guildDelete from "@/handlers/events/guildDelete"
import guildMemberAdd from "@/handlers/events/guildMemberAdd"
import interactionCreate from "@/handlers/events/interactionCreate"

const loadedEvents = [
  clientReady,
  interactionCreate,
  guildCreate,
  guildDelete,
  guildMemberAdd,
] as const

export type LoadedEvent = (typeof loadedEvents)[number]

export async function loadEvents(): Promise<LoadedEvent[]> {
  return [...loadedEvents]
}

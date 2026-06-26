import clientReady from "@/handlers/events/clientReady"
import channelCreate from "@/handlers/events/channelCreate"
import channelDelete from "@/handlers/events/channelDelete"
import guildBanAdd from "@/handlers/events/guildBanAdd"
import guildBanRemove from "@/handlers/events/guildBanRemove"
import guildCreate from "@/handlers/events/guildCreate"
import guildDelete from "@/handlers/events/guildDelete"
import guildMemberAdd from "@/handlers/events/guildMemberAdd"
import guildMemberRemove from "@/handlers/events/guildMemberRemove"
import interactionCreate from "@/handlers/events/interactionCreate"
import messageDelete from "@/handlers/events/messageDelete"
import roleCreate from "@/handlers/events/roleCreate"
import roleDelete from "@/handlers/events/roleDelete"

const loadedEvents = [
  clientReady,
  interactionCreate,
  guildCreate,
  guildDelete,
  guildMemberAdd,
  guildMemberRemove,
  guildBanAdd,
  guildBanRemove,
  channelCreate,
  channelDelete,
  roleCreate,
  roleDelete,
  messageDelete,
] as const

export type LoadedEvent = (typeof loadedEvents)[number]

export async function loadEvents(): Promise<LoadedEvent[]> {
  return [...loadedEvents]
}

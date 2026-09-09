import type { Command } from "@/classes/Command"
import cleo from "@/handlers/commands/management/cleo"
import ban from "@/handlers/commands/moderation/ban"
import kick from "@/handlers/commands/moderation/kick"
import ping from "@/handlers/commands/utility/ping"

export const commandRegistry = [
  ping,
  cleo,
  ban,
  kick,
] as const satisfies readonly Command[]

export async function loadCommands(): Promise<Command[]> {
  return [...commandRegistry]
}

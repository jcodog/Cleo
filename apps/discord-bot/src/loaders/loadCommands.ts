import type { Command } from "@/classes/Command"
import ban from "@/handlers/commands/moderation/ban"
import kick from "@/handlers/commands/moderation/kick"
import help from "@/handlers/commands/utility/help"
import ping from "@/handlers/commands/utility/ping"

export const commandRegistry = [
  ping,
  help,
  ban,
  kick,
] as const satisfies readonly Command[]

export async function loadCommands(): Promise<Command[]> {
  return [...commandRegistry]
}

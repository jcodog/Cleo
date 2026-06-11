import type { Command } from "@/classes/Command"
import profile from "@/handlers/commands/user/profile"
import help from "@/handlers/commands/utility/help"
import ping from "@/handlers/commands/utility/ping"

export const commandRegistry = [
  ping,
  help,
  profile,
] as const satisfies readonly Command[]

export async function loadCommands(): Promise<Command[]> {
  return [...commandRegistry]
}

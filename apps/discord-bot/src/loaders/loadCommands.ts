import type { Command } from "@workspace/discord-bot/classes/Command"
import profile from "@workspace/discord-bot/handlers/commands/user/profile"
import help from "@workspace/discord-bot/handlers/commands/utility/help"
import ping from "@workspace/discord-bot/handlers/commands/utility/ping"

export const commandRegistry = [
  ping,
  help,
  profile,
] as const satisfies readonly Command[]

export async function loadCommands(): Promise<Command[]> {
  return [...commandRegistry]
}

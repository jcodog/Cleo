import type { Command } from "@workspace/discord-bot/classes/Command"
import profile from "@workspace/discord-bot/handlers/commands/user/profile"
import help from "@workspace/discord-bot/handlers/commands/utility/help"
import ping from "@workspace/discord-bot/handlers/commands/utility/ping"

export async function loadCommands(): Promise<Command[]> {
  return [ping, help, profile]
}

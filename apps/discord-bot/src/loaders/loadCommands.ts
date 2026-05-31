import type { Command } from "@workspace/discord-bot/classes/Command"
import pingCommand from "@workspace/discord-bot/handlers/commands/ping"

export async function loadCommands(): Promise<Command[]> {
  return [pingCommand]
}

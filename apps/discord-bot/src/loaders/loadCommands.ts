import type { Command } from "@/classes/Command"
import eightBall from "@/handlers/commands/fun/eightBall"
import cleo from "@/handlers/commands/management/cleo"
import ban from "@/handlers/commands/moderation/ban"
import kick from "@/handlers/commands/moderation/kick"
import ping from "@/handlers/commands/utility/ping"

export const commandRegistry = [
  ping,
  eightBall,
  cleo,
  ban,
  kick,
] as const satisfies readonly Command[]

export async function loadCommands(): Promise<Command[]> {
  return [...commandRegistry]
}

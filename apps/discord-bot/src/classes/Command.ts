import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js"

export type CommandData = RESTPostAPIChatInputApplicationCommandsJSONBody

export type CommandContext = {
  interaction: ChatInputCommandInteraction
}

export type CommandOptions<TData extends CommandData = CommandData> = {
  data: TData
  execute: (context: CommandContext) => Promise<void> | void
}

export class Command<TData extends CommandData = CommandData> {
  public readonly data: TData
  public readonly execute: CommandOptions<TData>["execute"]

  public constructor(options: CommandOptions<TData>) {
    this.data = options.data
    this.execute = options.execute
  }
}

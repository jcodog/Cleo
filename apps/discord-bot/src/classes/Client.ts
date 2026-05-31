import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  type ClientEvents,
  type ClientOptions,
} from "discord.js"

import type { Command } from "./Command"
import type { Event } from "./Event"
import { loadCommands } from "../loaders/loadCommands"
import { loadEvents } from "../loaders/loadEvents"
import { botLog } from "@workspace/discord-bot/utils/botLog"

const defaultClientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.GuildMember, Partials.User],
} satisfies ClientOptions

export class BotClient extends Client {
  public readonly commands = new Collection<string, Command>()

  public constructor(options: ClientOptions = defaultClientOptions) {
    super(options)
  }

  public async start(token: string): Promise<void> {
    botLog("Starting Cleo Discord bot runtime...", "info")
    await this.registerHandlers()

    botLog("Logging in to Discord...", "info")
    await this.login(token)
  }

  private async registerHandlers(): Promise<void> {
    await this.registerCommands()
    await this.registerEvents()
  }

  private async registerCommands(): Promise<void> {
    const commands = await loadCommands()

    for (const command of commands) {
      this.commands.set(command.data.name, command)
      botLog(`Loaded command: /${command.data.name}`, "success")
    }

    botLog(`Registered ${commands.length} command handler(s).`, "info")
  }

  private async registerEvents(): Promise<void> {
    const events = await loadEvents()

    for (const event of events) {
      this.registerEvent(event)

      const mode = event.once ? "once" : "on"
      botLog(`Loaded event: ${String(event.name)} (${mode})`, "success")
    }

    botLog(`Registered ${events.length} event handler(s).`, "info")
  }

  private registerEvent<TEventName extends keyof ClientEvents>(
    event: Event<TEventName>
  ): void {
    const listener = (...args: ClientEvents[TEventName]) => {
      void event.execute(...args)
    }

    if (event.once) {
      this.once(event.name, listener)
      return
    }

    this.on(event.name, listener)
  }
}

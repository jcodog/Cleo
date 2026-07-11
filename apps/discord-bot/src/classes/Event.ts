import type { ClientEvents } from "discord.js"

export type EventOptions<TEventName extends keyof ClientEvents> = {
  name: TEventName
  once?: boolean
  execute: (...args: ClientEvents[TEventName]) => Promise<void> | void
}

export class Event<TEventName extends keyof ClientEvents = keyof ClientEvents> {
  public readonly name: TEventName
  public readonly once: boolean
  public readonly execute: EventOptions<TEventName>["execute"]

  public constructor(options: EventOptions<TEventName>) {
    this.name = options.name
    this.once = options.once ?? false
    this.execute = options.execute
  }
}

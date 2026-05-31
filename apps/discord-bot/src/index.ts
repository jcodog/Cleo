import { BotClient } from "./classes/Client"
import { discordEnv } from "@workspace/env/discord"

const client = new BotClient()

await client.start(discordEnv.DISCORD_BOT_TOKEN)

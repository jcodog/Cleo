import { fileURLToPath } from "node:url"

import { startDiscordBotRuntimeFromEnv } from "./runtime/startup"

await startDiscordBotRuntimeFromEnv({
  entrypoint: fileURLToPath(import.meta.url),
})

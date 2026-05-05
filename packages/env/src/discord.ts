import { createEnv } from "@t3-oss/env-core"

import { nodeEnv, optionalString, optionalUrl } from "./shared"

export const discordEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,

    CONVEX_URL: optionalUrl,

    DISCORD_CLIENT_ID: optionalString,
    DISCORD_BOT_TOKEN: optionalString,
    DISCORD_PUBLIC_KEY: optionalString,
    DISCORD_APPLICATION_ID: optionalString,

    OPENAI_API_KEY: optionalString,
  },
  runtimeEnv: process.env,
})

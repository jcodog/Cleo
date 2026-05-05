import { createEnv } from "@t3-oss/env-core"

import { nodeEnv, optionalString, optionalUrl } from "./shared"

export const kickEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,

    CONVEX_URL: optionalUrl,

    KICK_CLIENT_ID: optionalString,
    KICK_CLIENT_SECRET: optionalString,
    KICK_WEBHOOK_SECRET: optionalString,
  },
  runtimeEnv: process.env,
})

import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

import { nodeEnv, optionalString, optionalUrl } from "./shared"

export const webEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,

    CONVEX_DEPLOYMENT: optionalString,
    CONVEX_URL: optionalUrl,

    WORKOS_CLIENT_ID: optionalString,
    WORKOS_API_KEY: optionalString,
    WORKOS_COOKIE_PASSWORD: z.string().min(32).optional(),

    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,

    DISCORD_CLIENT_ID: optionalString,
    DISCORD_CLIENT_SECRET: optionalString,

    KICK_CLIENT_ID: optionalString,
    KICK_CLIENT_SECRET: optionalString,
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_CONVEX_URL: optionalUrl,
    NEXT_PUBLIC_APP_URL: optionalUrl,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: optionalUrl,
  },
  runtimeEnv: process.env,
})

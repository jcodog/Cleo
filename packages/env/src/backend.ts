import { createEnv } from "@t3-oss/env-core"

import { nodeEnv, optionalString, optionalUrl } from "./shared"

export const backendEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,

    CONVEX_DEPLOYMENT: optionalString,
    CONVEX_URL: optionalUrl,

    CLERK_JWT_ISSUER_DOMAIN: optionalUrl,
    CLERK_SECRET_KEY: optionalString,

    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
  },
  runtimeEnv: process.env,
})

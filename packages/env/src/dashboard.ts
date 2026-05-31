import { createEnv } from "@t3-oss/env-core"

import { nodeEnv, optionalString, optionalUrl } from "./shared"

export const dashboardEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,
    CLERK_SECRET_KEY: optionalString,
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_CONVEX_URL: optionalUrl,
    NEXT_PUBLIC_APP_URL: optionalUrl,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: optionalString,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: optionalString,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: optionalString,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: optionalString,
  },
  runtimeEnv: process.env,
})

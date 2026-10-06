import { createEnv } from "@t3-oss/env-core"
import { nodeEnv, optionalString, optionalUrl } from "./shared"

export const landingEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,
    VERCEL_URL: optionalString,
    VERCEL_ENV: optionalString,
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_SITE_URL: optionalUrl,
    NEXT_PUBLIC_APP_URL: optionalUrl,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
})

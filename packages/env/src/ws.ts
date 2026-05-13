import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

import { nodeEnv, optionalString, optionalUrl } from "./shared"

export const wsEnv = createEnv({
  server: {
    NODE_ENV: nodeEnv,

    CONVEX_URL: optionalUrl,

    PORT: z.coerce.number().default(3001),
    WS_SHARED_SECRET: optionalString,
  },
  runtimeEnv: process.env,
})

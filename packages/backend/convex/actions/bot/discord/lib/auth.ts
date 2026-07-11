"use node"

import { backendEnv } from "@workspace/env/backend"
import { createHash, timingSafeEqual } from "node:crypto"
import { ConvexError } from "convex/values"

export function assertValidBotSecret(secret: string): void {
  const configuredSecret = backendEnv.DISCORD_BOT_CONVEX_SECRET

  if (!configuredSecret || !timingSafeSecretEqual(secret, configuredSecret)) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Invalid Discord bot Convex secret.",
    })
  }
}

function timingSafeSecretEqual(value: string, expected: string): boolean {
  const valueBytes = createHash("sha256").update(value).digest()
  const expectedBytes = createHash("sha256").update(expected).digest()

  return timingSafeEqual(valueBytes, expectedBytes)
}

"use node"

import { backendEnv } from "@workspace/env/backend"
import { timingSafeEqual } from "node:crypto"
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
  if (value.length !== expected.length) {
    return false
  }

  const valueBytes = Buffer.from(value)
  const expectedBytes = Buffer.from(expected)

  if (valueBytes.length !== expectedBytes.length) {
    return false
  }

  return timingSafeEqual(valueBytes, expectedBytes)
}

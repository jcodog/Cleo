"use node"

import { isDiscordSnowflake } from "@workspace/shared/discordRuntimeConfig"
import { ConvexError } from "convex/values"

export function assertDiscordSnowflake(field: string, value: string): void {
  if (!isDiscordSnowflake(value)) {
    throw new ConvexError({
      code: "INVALID_DISCORD_SNOWFLAKE",
      message: `${field} must be a valid Discord snowflake.`,
    })
  }
}

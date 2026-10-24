"use node"
import { z } from "zod"
import { backendEnv } from "@workspace/env/backend"
import { getClerkDiscordAccessToken } from "./clerkOAuth"
export class DiscordCapabilityError extends Error {
  constructor(readonly status: number) {
    super(`Discord capability unavailable (${status}).`)
  }
}

export async function discordJson(
  path: string,
  token: string,
  init: RequestInit = {},
  bot = false
): Promise<unknown> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `${bot ? "Bot" : "Bearer"} ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new DiscordCapabilityError(response.status)
  if (response.status === 204) return null
  const body = await response.text()
  if (body.length > 1048576) throw new Error("Discord response exceeds limit.")
  return JSON.parse(body)
}
const guildList = z
  .array(
    z.object({
      id: z.string(),
      owner: z.boolean().optional(),
      permissions: z.string().optional(),
    })
  )
  .max(200)
export async function verifiedDiscordGuilds(
  clerkUserId: string,
  discordUserId: string
) {
  const token = await getClerkDiscordAccessToken(clerkUserId)
  if (token.status !== "ready")
    throw new Error("Refresh your Discord account connection.")
  const me = z
    .object({ id: z.string() })
    .parse(await discordJson("/users/@me", token.accessToken))
  if (me.id !== discordUserId)
    throw new Error("Discord account identity changed.")
  const result: z.infer<typeof guildList> = []
  let after = ""
  for (let page = 0; page < 5; page++) {
    const guilds = guildList.parse(
      await discordJson(
        `/users/@me/guilds?limit=200${after ? `&after=${after}` : ""}`,
        token.accessToken
      )
    )
    result.push(...guilds)
    if (guilds.length < 200) return result
    after = guilds.at(-1)?.id ?? ""
  }
  throw new Error(
    "Discord membership verification exceeded the supported bound."
  )
}
export function discordApplicationConfig() {
  const applicationId = backendEnv.DISCORD_APPLICATION_ID
  if (!applicationId || !/^\d{17,20}$/.test(applicationId))
    throw new Error("Discord application is not configured.")
  return applicationId
}

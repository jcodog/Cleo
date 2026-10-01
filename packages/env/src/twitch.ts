import { z } from "zod"

import { createOptionalUrl, nodeEnv } from "./shared"

const requiredText = z.string().trim().min(1)
const userId = z.string().regex(/^[1-9]\d*$/)
const privatePath = requiredText.refine(
  (value) => value.startsWith("/") || /^[a-z]:[\\/]/i.test(value),
  "An absolute private path is required."
)

export const twitchEventSubSecret = z.string().regex(/^[\x21-\x7e]{10,100}$/)

const credentials = z.object({
  NODE_ENV: nodeEnv,
  TWITCH_CLIENT_ID: requiredText,
  TWITCH_CLIENT_SECRET: requiredText,
  TWITCH_BOT_USER_ID: userId,
  TWITCH_BOT_GRANT_PATH: privatePath,
  TWITCH_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(10000),
})

export type TwitchCredentials = z.infer<typeof credentials>

export function resolveTwitchCredentials(
  env: Record<string, string | undefined> = process.env
): TwitchCredentials {
  return parseEnvironment(credentials, env)
}

export function resolveTwitchRuntimeEnv(
  env: Record<string, string | undefined> = process.env
) {
  const schema = credentials
    .extend({
      TWITCH_BOOTSTRAP_BROADCASTER_USER_ID: userId,
      TWITCH_EVENTSUB_CALLBACK_URL: createOptionalUrl({
        nodeEnv: () => env.NODE_ENV,
      }).pipe(
        z.string().refine((value) => {
          const url = new URL(value)
          return (
            url.protocol === "https:" &&
            (!url.port || url.port === "443") &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            url.pathname === "/twitch-eventsub"
          )
        }, "A public HTTPS /twitch-eventsub callback on port 443 is required.")
      ),
      TWITCH_EVENTSUB_SECRET: twitchEventSubSecret,
      TWITCH_READINESS_PATH: privatePath,
      TWITCH_STARTUP_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(180000)
        .default(90000),
    })
    .refine(
      (value) =>
        value.TWITCH_BOT_USER_ID !== value.TWITCH_BOOTSTRAP_BROADCASTER_USER_ID,
      {
        path: ["TWITCH_BOOTSTRAP_BROADCASTER_USER_ID"],
        message: "The dedicated bot must differ from the broadcaster.",
      }
    )
  return parseEnvironment(schema, env)
}

export type TwitchRuntimeEnv = ReturnType<typeof resolveTwitchRuntimeEnv>

export function resolveTwitchOperatorEnv(
  env: Record<string, string | undefined> = process.env
) {
  const value = resolveTwitchCredentials(env)
  const redirect = createOptionalUrl({ nodeEnv: () => env.NODE_ENV })
    .pipe(z.string())
    .safeParse(env.TWITCH_BOT_REDIRECT_URI)
  if (!redirect.success)
    throw new Error("Invalid Twitch environment: TWITCH_BOT_REDIRECT_URI")
  const url = new URL(redirect.data)
  if (
    url.protocol !== "http:" ||
    url.hostname !== "localhost" ||
    !url.port ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "TWITCH_BOT_REDIRECT_URI must be http://localhost:<port>/callback for the local operator utility."
    )
  }
  return { ...value, TWITCH_BOT_REDIRECT_URI: url.href }
}

function parseEnvironment<T>(
  schema: z.ZodType<T>,
  env: Record<string, string | undefined>
): T {
  const result = schema.safeParse(env)
  if (!result.success) {
    const keys = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ].join(", ")
    throw new Error(`Invalid Twitch environment: ${keys}`)
  }
  return result.data
}

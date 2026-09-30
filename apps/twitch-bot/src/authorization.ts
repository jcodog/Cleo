import { randomBytes, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"

import type { TwitchCredentials } from "@workspace/env/twitch"
import { BOT_SCOPES, TwitchApi } from "./api"
import { createGrant, GrantStore } from "./grantStore"

type OperatorConfig = TwitchCredentials & { TWITCH_BOT_REDIRECT_URI: string }
export type CallbackResult =
  | { status: "code"; code: string }
  | { status: "denied" }
  | { status: "invalid" }

export function authorizationUrl(
  config: OperatorConfig,
  state: string
): string {
  const url = new URL("https://id.twitch.tv/oauth2/authorize")
  url.search = new URLSearchParams({
    client_id: config.TWITCH_CLIENT_ID,
    redirect_uri: config.TWITCH_BOT_REDIRECT_URI,
    response_type: "code",
    scope: BOT_SCOPES.join(" "),
    state,
    force_verify: "true",
  }).toString()
  return url.href
}

export function parseAuthorizationCallback(
  url: URL,
  expectedState: string
): CallbackResult {
  const state = url.searchParams.get("state") ?? ""
  const actual = Buffer.from(state)
  const expected = Buffer.from(expectedState)
  if (
    url.pathname !== "/callback" ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return { status: "invalid" }
  if (url.searchParams.has("error")) return { status: "denied" }
  const code = url.searchParams.get("code")
  return code && code.length <= 2048
    ? { status: "code", code }
    : { status: "invalid" }
}

export async function waitForBotCode(
  redirectUri: string,
  state: string,
  showUrl: () => void,
  timeoutMs = 300000
): Promise<string> {
  const redirect = new URL(redirectUri)
  return new Promise((resolve, reject) => {
    const finish = (result: { code: string } | { error: Error }) => {
      clearTimeout(timer)
      server.close()
      if ("code" in result) resolve(result.code)
      else reject(result.error)
    }
    const server = createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store")
      response.setHeader("Content-Type", "text/plain; charset=utf-8")
      response.setHeader("Referrer-Policy", "no-referrer")
      let result: CallbackResult = { status: "invalid" }
      try {
        result = parseAuthorizationCallback(
          new URL(String(request.url), redirect),
          state
        )
      } catch {
        /* Reject malformed callback targets. */
      }
      if (request.method !== "GET" || result.status === "invalid") {
        response.writeHead(403).end("Invalid authorization callback.")
        return
      }
      if (result.status === "denied") {
        response
          .writeHead(400)
          .end("Authorization was denied. Close this window.")
        finish({ error: new Error("Bot authorization denied.") })
        return
      }
      response
        .writeHead(200)
        .end(
          "Authorization received. Check the local operator command for the result, then close this window."
        )
      finish({ code: result.code })
    })
    server.headersTimeout = 5000
    server.requestTimeout = 10000
    server.on("error", () =>
      finish({
        error: new Error("Cannot bind the operator callback listener."),
      })
    )
    const timer = setTimeout(
      () => finish({ error: new Error("Bot authorization timed out.") }),
      timeoutMs
    )
    server.listen(Number(redirect.port), "127.0.0.1", showUrl)
  })
}

export async function authorizeBot(
  config: OperatorConfig,
  dependencies: {
    api: TwitchApi
    store: GrantStore
    showUrl: (url: string) => void
    waitForCode?: typeof waitForBotCode
  }
): Promise<void> {
  const state = randomBytes(32).toString("hex")
  const url = authorizationUrl(config, state)
  const code = await (dependencies.waitForCode ?? waitForBotCode)(
    config.TWITCH_BOT_REDIRECT_URI,
    state,
    () => dependencies.showUrl(url)
  )
  const token = await dependencies.api.exchangeBotCode(
    code,
    config.TWITCH_BOT_REDIRECT_URI
  )
  await dependencies.api.validateBotToken(token.access_token)
  await dependencies.store.locked(() =>
    dependencies.store.write(createGrant(token, config), false)
  )
}

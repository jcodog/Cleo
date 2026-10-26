import assert from "node:assert/strict"
import { test } from "node:test"

test("Clerk Discord token validation rejects missing consent, wrong app, wrong identity, expiry and provider failure", async (t) => {
  const keys = ["CLERK_SECRET_KEY", "DISCORD_APPLICATION_ID"] as const
  const previous = keys.map((key) => [key, process.env[key]] as const)
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  process.env.CLERK_SECRET_KEY = "fixture"
  process.env.DISCORD_APPLICATION_ID = "888888888888888888"
  const {
    clerkDiscordRoleToken,
    DiscordRoleConsentRequired,
    DiscordRoleApplicationMismatch,
  } = await import("./clerkDiscordRoles")
  let app = "888888888888888888",
    user = "111111111111111111",
    scopes = ["identify", "role_connections.write"]
  let expires = new Date(Date.now() + 3600000).toISOString(),
    providerStatus = 200,
    linked = user
  const calls: string[] = []
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)
      assert.ok(init?.signal)
      if (url.endsWith("/users/clerk"))
        return Response.json({
          id: "clerk",
          external_accounts: [
            { provider: "oauth_discord", provider_user_id: linked },
          ],
        })
      if (url.includes("oauth_access_tokens")) {
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          "Bearer fixture"
        )
        return Response.json([{ token: "provider-token" }], {
          status: providerStatus,
        })
      }
      assert.equal(url, "https://discord.com/api/v10/oauth2/@me")
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer provider-token"
      )
      return Response.json({
        application: { id: app },
        user: { id: user },
        scopes,
        expires,
      })
    }
  )
  assert.equal(
    (await clerkDiscordRoleToken("clerk", user)).accessToken,
    "provider-token"
  )
  scopes = ["identify"]
  await assert.rejects(
    clerkDiscordRoleToken("clerk", user),
    DiscordRoleConsentRequired
  )
  scopes = ["identify", "role_connections.write"]
  app = "777777777777777777"
  await assert.rejects(
    clerkDiscordRoleToken("clerk", user),
    DiscordRoleApplicationMismatch
  )
  app = "888888888888888888"
  user = "222222222222222222"
  await assert.rejects(
    clerkDiscordRoleToken("clerk", "111111111111111111"),
    /identity does not match/
  )
  user = "111111111111111111"
  expires = new Date(Date.now() - 1).toISOString()
  await assert.rejects(
    clerkDiscordRoleToken("clerk", user),
    DiscordRoleConsentRequired
  )
  providerStatus = 503
  await assert.rejects(clerkDiscordRoleToken("clerk", user), /unavailable/)
  linked = "222222222222222222"
  const count = calls.length
  await assert.rejects(clerkDiscordRoleToken("clerk", user), /identity changed/)
  assert.equal(
    calls.length,
    count + 1,
    "Mismatched Clerk identities never fetch a token"
  )
})

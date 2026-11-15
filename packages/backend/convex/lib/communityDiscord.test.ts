import assert from "node:assert/strict"
import { test } from "node:test"
import { DiscordTokenError, verifiedDiscordGuilds } from "./communityDiscord"

test("Discord verification preserves safe Clerk token failure categories without logging tokens", async (t) => {
  const secret = process.env.CLERK_SECRET_KEY
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
    if (secret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = secret
  })
  for (const [mode, reason] of [
    ["missing", "clerkSecretUnavailable"],
    ["outage", "discordTokenResolutionUnavailable"],
    ["unlinked", "discordAccessTokenUnavailable"],
  ] as const) {
    if (mode === "missing") delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = "sk_test_never-log-this"
    globalThis.fetch = async () =>
      mode === "outage"
        ? new Response(null, { status: 503 })
        : Response.json([])
    await assert.rejects(
      verifiedDiscordGuilds("clerk_user", "discord_user"),
      (error: unknown) => {
        assert.ok(error instanceof DiscordTokenError)
        assert.equal(error.reason, reason)
        assert.ok(!error.message.includes("sk_test"))
        return true
      }
    )
  }
})

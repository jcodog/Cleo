import assert from "node:assert/strict"
import { test } from "node:test"

import {
  getClerkDiscordAccessToken,
  getClerkProviderAccessToken,
  getClerkTwitchAccessToken,
} from "./clerkOAuth"

test("provider token helper uses exact trusted endpoint with bounded fetch and keeps Discord contracts", async () => {
  const original = fetch
  const secret = process.env.CLERK_SECRET_KEY
  try {
    process.env.CLERK_SECRET_KEY = "test-only-clerk-secret"
    const calls: string[] = []
    globalThis.fetch = async (input, init) => {
      calls.push(String(input))
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test-only-clerk-secret"
      )
      assert.ok(init?.signal)
      return Response.json([{ token: "test-only-provider-access" }])
    }
    assert.deepEqual(await getClerkTwitchAccessToken("user/test"), {
      status: "ready",
      accessToken: "test-only-provider-access",
    })
    assert.deepEqual(await getClerkDiscordAccessToken("user/test"), {
      status: "ready",
      accessToken: "test-only-provider-access",
    })
    assert.deepEqual(calls, [
      "https://api.clerk.com/v1/users/user%2Ftest/oauth_access_tokens/oauth_twitch",
      "https://api.clerk.com/v1/users/user%2Ftest/oauth_access_tokens/oauth_discord",
    ])
    for (const [body, status, expected, discordReason] of [
      [null, 404, "providerNotLinked", "discordAccessTokenUnavailable"],
      [[], 200, "tokenUnavailable", "discordAccessTokenUnavailable"],
      [{ data: [] }, 200, "tokenUnavailable", "discordAccessTokenUnavailable"],
      [{}, 200, "providerUnavailable", "discordTokenResolutionUnavailable"],
      [
        [{ token: 123 }],
        200,
        "providerUnavailable",
        "discordTokenResolutionUnavailable",
      ],
      [null, 503, "providerUnavailable", "discordTokenResolutionUnavailable"],
    ] as const) {
      globalThis.fetch = async () => Response.json(body, { status })
      assert.deepEqual(await getClerkTwitchAccessToken("user"), {
        status: expected,
      })
      assert.deepEqual(await getClerkDiscordAccessToken("user"), {
        status: "unavailable",
        reason: discordReason,
      })
    }
    globalThis.fetch = async () => new Response("malformed")
    assert.deepEqual(await getClerkTwitchAccessToken("user"), {
      status: "providerUnavailable",
    })
    globalThis.fetch = async () => {
      throw new Error("test-only-provider-secret")
    }
    assert.deepEqual(await getClerkTwitchAccessToken("user"), {
      status: "providerUnavailable",
    })
    delete process.env.CLERK_SECRET_KEY
    assert.deepEqual(await getClerkProviderAccessToken("user", "twitch"), {
      status: "secretUnavailable",
    })
    assert.deepEqual(await getClerkDiscordAccessToken("user"), {
      status: "unavailable",
      reason: "clerkSecretUnavailable",
    })
  } finally {
    globalThis.fetch = original
    if (secret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = secret
  }
})

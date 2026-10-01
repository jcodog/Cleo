import assert from "node:assert/strict"
import { test } from "node:test"

import {
  beginTwitchLink,
  getTwitchLinkState,
  twitchProviderError,
  twitchReturnPath,
} from "./linking"

test("Twitch connection states depend on current verified provider evidence and exact scope", () => {
  assert.equal(getTwitchLinkState([]), "notConnected")
  assert.equal(
    getTwitchLinkState([
      {
        provider: "discord",
        approvedScopes: "channel:bot",
        verification: { status: "verified" },
      },
    ]),
    "notConnected"
  )
  assert.equal(
    getTwitchLinkState([
      {
        provider: "twitch",
        approvedScopes: "channel:bot",
        verification: { status: "verified" },
      },
    ]),
    "connected"
  )
  assert.equal(
    getTwitchLinkState([
      {
        provider: "oauth_twitch",
        approvedScopes: "openid channel:bot",
        verification: { status: "verified" },
      },
    ]),
    "connected"
  )
  assert.equal(
    getTwitchLinkState([
      {
        provider: "twitch",
        approvedScopes: "channel:bot-other",
        verification: { status: "verified" },
      },
    ]),
    "missingPermission"
  )
  assert.equal(
    getTwitchLinkState([
      {
        provider: "twitch",
        approvedScopes: "channel:bot",
        verification: { status: "failed" },
      },
    ]),
    "reconnectRequired"
  )
  assert.equal(
    getTwitchLinkState([
      { provider: "twitch", approvedScopes: "channel:bot", verification: null },
    ]),
    "reconnectRequired"
  )
})

test("Twitch connect requests only intended additional scope and uses a dedicated callback", async () => {
  let calls = 0
  const url = await beginTwitchLink(
    {
      externalAccounts: [],
      createExternalAccount: async (params) => {
        calls++
        assert.deepEqual(params, {
          strategy: "oauth_twitch",
          additionalScopes: ["channel:bot"],
          redirectUrl:
            "https://cleo.example/twitch/link-callback?returnTo=%2Ftwitch",
        })
        return {
          verification: {
            externalVerificationRedirectURL: new URL(
              "https://clerk.example/authorize"
            ),
          },
        }
      },
    },
    "https://cleo.example"
  )
  assert.equal(url, "https://clerk.example/authorize")
  assert.equal(calls, 1)
})

test("already linked Twitch account uses reauthorization and never creates a duplicate", async () => {
  for (const provider of ["twitch", "oauth_twitch"]) {
    const url = await beginTwitchLink(
      {
        externalAccounts: [
          {
            provider,
            reauthorize: async (params) => {
              assert.deepEqual(params.additionalScopes, ["channel:bot"])
              return {
                verification: {
                  externalVerificationRedirectURL: new URL(
                    "https://clerk.example/reauthorize"
                  ),
                },
              }
            },
          },
        ],
        createExternalAccount: async () => {
          throw new Error("must not duplicate")
        },
      },
      "https://cleo.example"
    )
    assert.equal(url, "https://clerk.example/reauthorize")
  }
})

test("scoped reauthorization unions desired events with previous approvals and deduplicates overlapping permissions", async () => {
  let called = 0
  await beginTwitchLink(
    {
      externalAccounts: [
        {
          provider: "twitch",
          approvedScopes: "channel:bot bits:read user:read:email",
          reauthorize: async (params) => {
            called++
            assert.deepEqual(params.additionalScopes, [
              "channel:bot",
              "moderator:read:followers",
              "channel:read:subscriptions",
              "bits:read",
              "channel:read:hype_train",
              "user:read:email",
            ])
            assert.equal(
              params.redirectUrl,
              "https://cleo.example/twitch/link-callback?returnTo=%2Ftwitch"
            )
            return {
              verification: {
                externalVerificationRedirectURL: new URL(
                  "https://clerk.example/authorize"
                ),
              },
            }
          },
        },
      ],
      createExternalAccount: async () => {
        throw new Error("duplicate account")
      },
    },
    "https://cleo.example",
    [
      "follow",
      "subscribe",
      "resubscribe",
      "cheer",
      "hypeTrainBegin",
      "hypeTrainEnd",
    ]
  )
  assert.equal(called, 1)
})

test("missing/insecure verification URLs and provider failures fail rather than navigating", async () => {
  for (const redirect of [null, new URL("http://insecure.example")])
    await assert.rejects(
      beginTwitchLink(
        {
          externalAccounts: [],
          createExternalAccount: async () => ({
            verification: { externalVerificationRedirectURL: redirect },
          }),
        },
        "https://cleo.example"
      ),
      /secure authorization URL/
    )
  await assert.rejects(
    beginTwitchLink(
      {
        externalAccounts: [],
        createExternalAccount: async () => ({ verification: null }),
      },
      "https://cleo.example"
    )
  )
  await assert.rejects(
    beginTwitchLink(
      {
        externalAccounts: [],
        createExternalAccount: async () => {
          throw new Error("provider cancellation")
        },
      },
      "https://cleo.example"
    ),
    /cancellation/
  )
})

test("callback return paths reject external targets/loops and provider errors are safe fixed messages", () => {
  for (const path of [
    null,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/twitch/link-callback",
    "/%2f%2fevil.example",
  ])
    assert.equal(twitchReturnPath(path), "/twitch")
  assert.equal(twitchReturnPath("/account"), "/account")
  assert.equal(twitchProviderError(null), null)
  for (const code of ["access_denied", "cancelled", "denied"])
    assert.match(twitchProviderError(code) ?? "", /cancelled/)
  assert.equal(
    twitchProviderError("test-only-provider-sensitive-error")?.includes(
      "sensitive"
    ),
    false
  )
})

import assert from "node:assert/strict"
import { test, beforeEach, afterEach, mock } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import { createHmac, generateKeyPairSync, sign } from "node:crypto"
beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
afterEach(() => mock.timers.reset())

process.env.CLEO_OFFICIAL_GUILD_ID = "999999999999999999"
process.env.CLEO_COMMUNITY_ROLES_ENABLED = "false"
process.env.DISCORD_APPLICATION_ID = "888888888888888888"
process.env.DISCORD_CLIENT_SECRET = "fixture-client-secret"
process.env.DISCORD_BOT_CONVEX_SECRET = "fixture-bot-secret"
process.env.TWITCH_WORKER_SECRET = "fixture-worker-secret"
process.env.TWITCH_MODERATION_ENFORCEMENT_ENABLED = "true"
process.env.STRIPE_SECRET_KEY = "sk_test_fixture"
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture"
process.env.STRIPE_GUILD_PREMIUM_PRICE_ID = "price_premium"
process.env.STRIPE_TEST_CHECKOUT_ENABLED = "true"
process.env.CLEO_DASHBOARD_ORIGIN = "https://dashboard.example"
process.env.CLERK_SECRET_KEY = "fixture-clerk-key"
process.env.DISCORD_BOT_TOKEN = "fixture-bot-token"
process.env.DISCORD_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString(
  "base64"
)
process.env.DISCORD_ROLE_CONNECTION_REDIRECT_URL =
  "https://dashboard.example/discord/linked-role"
const webhookKeys = generateKeyPairSync("ed25519")
process.env.DISCORD_APPLICATION_PUBLIC_KEY = webhookKeys.publicKey
  .export({ type: "spki", format: "der" })
  .subarray(-32)
  .toString("hex")
const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./moderationPolicies.ts": () => import("./moderationPolicies"),
  "./moderationActions.ts": () => import("./moderationActions"),
  "./discordConnections.ts": () => import("./discordConnections"),
  "./communityRoles.ts": () => import("./communityRoles"),
  "./communityRuntime.ts": () => import("./communityRuntime"),
  "./communityActions.ts": () => import("./communityActions"),
  "./discordApplicationWebhooks.ts": () =>
    import("./discordApplicationWebhooks"),
  "./premiumPurchases.ts": () => import("./premiumPurchases"),
  "./premiumActions.ts": () => import("./premiumActions"),
  "./mutations/internal/guildBilling.ts": () =>
    import("./mutations/internal/guildBilling"),
  "./communityRecognition.ts": () => import("./communityRecognition"),
  "./mutations/dashboard/discord/guildConfigs/updateModules.ts": () =>
    import("./mutations/dashboard/discord/guildConfigs/updateModules"),
  "./mutations/dashboard/discord/guildConfigs/updateWorkspaceSection.ts": () =>
    import("./mutations/dashboard/discord/guildConfigs/updateWorkspaceSection"),
}
async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const now = Date.now()
    const userId = await ctx.db.insert("users", {
      clerkUserId: "alice",
      email: "alice@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    const otherId = await ctx.db.insert("users", {
      clerkUserId: "bob",
      email: "bob@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    const linkId = await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId: "111111111111111111",
      scopes: [],
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "twitch",
      providerAccountId: "222",
      scopes: [],
      createdAt: now,
      updatedAt: now,
    })
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId: "333333333333333333",
      name: "Private community",
      ownerDiscordId: "444444444444444444",
      botInstallationVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    const membershipId = await ctx.db.insert("discordGuildMemberships", {
      guildId,
      userId,
      discordUserId: "111111111111111111",
      canManage: true,
      isOwner: false,
      permissions: "8",
      managementVerifiedAt: now,
      managementVerificationSource: "discord-oauth",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("billingCustomers", {
      userId,
      clerkUserId: "alice",
      stripeCustomerId: "cus_alice",
      createdAt: now,
    })
    await ctx.db.insert("guildBillingPrices", {
      stripePriceId: "price_premium",
      stripeProductId: "prod_premium",
      enabled: true,
      updatedAt: now,
    })
    return { userId, otherId, guildId, linkId, membershipId }
  })
  return {
    t,
    alice: t.withIdentity({ subject: "alice" }),
    bob: t.withIdentity({ subject: "bob" }),
    ...ids,
  }
}
const discordUserId = "111111111111111111"
const discordGuildId = "333333333333333333"

test("Clerk Linked Roles requires consent once, validates the application, publishes idempotently and disconnects without revoking Clerk", async (t) => {
  const f = await fixture()
  let scopes = ["identify"],
    applicationId = "888888888888888888",
    publications = 0,
    removals = 0,
    expectedAccessToken = "clerk-provider-token"
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/users/alice"))
      return Response.json({
        id: "alice",
        external_accounts: [
          { provider: "oauth_discord", provider_user_id: discordUserId },
        ],
      })
    if (url.includes("oauth_access_tokens"))
      return Response.json([{ token: "clerk-provider-token" }])
    if (url.endsWith("/oauth2/@me"))
      return Response.json({
        application: { id: applicationId },
        user: { id: discordUserId },
        scopes,
        expires: new Date(Date.now() + 3600000).toISOString(),
      })
    if (url.endsWith("/users/@me")) return Response.json({ id: discordUserId })
    if (url.includes("/users/@me/guilds"))
      return Response.json([{ id: discordGuildId, permissions: "8" }])
    if (url.endsWith("/role-connection")) {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${expectedAccessToken}`
      )
      if (init?.method === "PUT") {
        publications++
        assert.ok(JSON.parse(String(init.body)).metadata.community_manager_tier)
      }
      if (init?.method === "DELETE") removals++
      return Response.json({})
    }
    assert.fail(`Unexpected provider call ${url}`)
  }
  assert.equal(
    await f.alice.action(api.communityActions.connectClerkLinkedRoles, {}),
    "consentRequired"
  )
  assert.equal(await f.alice.query(api.discordConnections.status, {}), null)
  scopes = ["identify", "role_connections.write"]
  assert.equal(
    await f.alice.action(api.communityActions.connectClerkLinkedRoles, {}),
    "ready"
  )
  assert.equal(publications, 1)
  const row = await f.t.query(internal.discordConnections.connection, {
    userId: f.userId,
  })
  assert.equal(row?.tokenSource, "clerk")
  assert.equal(
    row?.encryptedTokens,
    "",
    "Clerk access and refresh tokens are never stored in Convex"
  )
  assert.deepEqual(await f.alice.query(api.discordConnections.status, {}), {
    provider: "clerk",
    metadataPublished: true,
  })
  await f.alice.action(api.communityActions.connectClerkLinkedRoles, {})
  assert.equal(
    publications,
    1,
    "Repeated visits reuse consent and identical published metadata"
  )
  applicationId = "777777777777777777"
  assert.equal(
    await f.alice.action(api.communityActions.connectClerkLinkedRoles, {}),
    "applicationMismatch"
  )
  assert.equal(publications, 1)
  applicationId = "888888888888888888"
  await f.alice.action(api.communityActions.disconnectLinkedRoles, {})
  assert.equal(removals, 1)
  assert.equal(await f.alice.query(api.discordConnections.status, {}), null)
  const { encryptDiscordTokens } = await import("./lib/integrationSecurity")
  expectedAccessToken = "existing-fallback-token"
  await f.t.mutation(internal.discordConnections.storeTokens, {
    userId: f.userId,
    discordUserId,
    encryptedTokens: encryptDiscordTokens(
      JSON.stringify({
        access_token: expectedAccessToken,
        refresh_token: "existing-fallback-refresh",
        expires_in: 3600,
        scope: "identify role_connections.write",
      })
    ),
    expiresAt: Date.now() + 3600000,
  })
  applicationId = "777777777777777777"
  assert.equal(
    await f.alice.action(api.communityActions.connectClerkLinkedRoles, {}),
    "ready",
    "An existing valid fallback grant must not request OAuth again"
  )
  assert.equal(
    (await f.alice.query(api.discordConnections.status, {}))?.provider,
    "direct"
  )
  assert.equal(publications, 2)
  await assert.rejects(
    f.t.action(api.communityActions.connectClerkLinkedRoles, {}),
    /signed in/
  )
})

function interactionSnowflake(timestamp: number): string {
  return ((BigInt(timestamp) - 1420070400000n) << 22n).toString()
}

test("interaction creation time fences delayed evidence against signed deauthorization and expires without renewal on replay", async (t) => {
  const f = await fixture()
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  const deauthorizedAt = now - 2000
  const timestamp = String(Math.floor(now / 1000))
  const body = JSON.stringify({
    type: 1,
    application_id: process.env.DISCORD_APPLICATION_ID,
    event: {
      type: "APPLICATION_DEAUTHORIZED",
      timestamp: new Date(deauthorizedAt).toISOString(),
      data: { user: { id: discordUserId } },
    },
  })
  assert.equal(
    await f.t.action(internal.discordApplicationWebhooks.receive, {
      body,
      timestamp,
      signature: sign(
        null,
        Buffer.from(timestamp + body),
        webhookKeys.privateKey
      ).toString("hex"),
    }),
    true
  )
  const record = (createdAt: number) =>
    f.t.action(api.communityRuntime.installationInteraction, {
      secret: "fixture-bot-secret",
      discordUserId,
      interactionId: interactionSnowflake(createdAt),
    })
  await record(now - 3000)
  const installation = () =>
    f.t.run((ctx) => ctx.db.query("discordUserInstallations").unique())
  assert.equal((await installation())?.evidenceAt, deauthorizedAt)
  const revoked = await f.alice.query(api.communityRoles.current, {})
  assert.equal(revoked?.discordBotUser, "verificationNeeded")
  assert.equal(revoked?.member, "eligible")
  await record(deauthorizedAt)
  assert.equal((await installation())?.state, "uncertain")
  const createdAt = now - 1000
  await record(createdAt)
  assert.equal((await installation())?.state, "active")
  assert.equal((await installation())?.evidenceAt, createdAt)
  assert.equal((await installation())?.expiresAt, createdAt + 86400000)
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "eligible"
  )
  const receipts = await f.t.run((ctx) =>
    ctx.db.query("integrationReceipts").collect()
  )
  const job = await f.t.run((ctx) => ctx.db.query("communityRoleJobs").unique())
  now += 10000
  await record(createdAt)
  assert.deepEqual(
    await f.t.run((ctx) => ctx.db.query("integrationReceipts").collect()),
    receipts
  )
  assert.deepEqual(
    await f.t.run((ctx) => ctx.db.query("communityRoleJobs").unique()),
    job
  )
  assert.equal((await installation())?.expiresAt, createdAt + 86400000)
  now = createdAt + 86400000
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "verificationNeeded"
  )
})

test("equal-time negative evidence wins in either processing order", async (t) => {
  const f = await fixture()
  const now = Date.now()
  t.mock.method(Date, "now", () => now)
  const args = {
    secret: "fixture-bot-secret",
    discordUserId,
    interactionId: interactionSnowflake(now),
  }
  await f.t.action(api.communityRuntime.installationInteraction, args)
  await f.t.mutation(internal.discordConnections.installation, {
    discordUserId,
    state: "revoked",
    evidenceAt: now,
    eventKey: "equal-time-revocation",
  })
  await f.t.action(api.communityRuntime.installationInteraction, args)
  const installation = await f.t.run((ctx) =>
    ctx.db.query("discordUserInstallations").unique()
  )
  assert.equal(installation?.state, "revoked")
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "notEligible"
  )
})

test("interaction timestamp validation rejects stale, future and overflowing snowflakes without recording evidence", async (t) => {
  const f = await fixture()
  const now = Date.now()
  t.mock.method(Date, "now", () => now)
  for (const interactionId of [
    "not-a-snowflake",
    "00000000000000000",
    "18446744073709551616",
    interactionSnowflake(now + 5001),
    interactionSnowflake(now - 86400000),
    interactionSnowflake(now - 86400001),
  ])
    await assert.rejects(
      f.t.action(api.communityRuntime.installationInteraction, {
        secret: "fixture-bot-secret",
        discordUserId,
        interactionId,
      }),
      /Invalid Discord interaction/
    )
  assert.equal(
    await f.t.run((ctx) => ctx.db.query("discordUserInstallations").first()),
    null
  )
  assert.equal(
    await f.t.run((ctx) => ctx.db.query("integrationReceipts").first()),
    null
  )
  await assert.rejects(
    f.t.action(api.communityRuntime.installationInteraction, {
      secret: "wrong-secret",
      discordUserId,
      interactionId: interactionSnowflake(now),
    }),
    /Invalid Discord bot Convex secret/
  )
  await f.t.action(api.communityRuntime.installationInteraction, {
    secret: "fixture-bot-secret",
    discordUserId,
    interactionId: interactionSnowflake(now - 86399999),
  })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("discordUserInstallations").unique()))
      ?.expiresAt,
    now + 1
  )
  await f.t.action(api.communityRuntime.installationInteraction, {
    secret: "fixture-bot-secret",
    discordUserId,
    interactionId: interactionSnowflake(now + 5000),
  })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("discordUserInstallations").unique()))
      ?.evidenceAt,
    now + 5000
  )
})

test("moderation reads expose unavailable authority without leaking policies or weakening writes", async () => {
  const f = await fixture()
  const args = { platform: "discord" as const, scopeId: discordGuildId }
  await f.t.run((ctx) =>
    ctx.db.patch(f.membershipId, { managementVerifiedAt: Date.now() - 300001 })
  )
  let result = await f.alice.query(api.moderationPolicies.get, args)
  assert.equal(result.status, "unavailable")
  assert.ok(!("policyJSON" in result))
  await assert.rejects(
    f.alice.mutation(api.moderationPolicies.save, {
      ...args,
      policyJSON: "{}",
      expectedRevision: 0,
      enforcement: false,
    }),
    /Refresh/
  )
  await f.t.run((ctx) => ctx.db.patch(f.guildId, { botLeftAt: Date.now() }))
  result = await f.alice.query(api.moderationPolicies.get, args)
  assert.deepEqual(result, {
    status: "unavailable",
    message: "Cleo must be installed.",
  })
})

test("compiled policy expansion cannot exceed the persisted runtime payload limit", async () => {
  const f = await fixture()
  const { compileModerationPolicy } =
    await import("@workspace/shared/moderation")
  const identities = Array.from({ length: 100 }, () => "a".repeat(128))
  let input = "",
    compiled = ""
  for (let count = 0; count <= 100; count++) {
    const raw = {
      exemptions: { userIds: identities, roleIds: identities },
      rules: {
        links: { exemptions: { userIds: identities, roleIds: identities } },
        discordInvites: { exemptions: { userIds: identities.slice(0, count) } },
      },
    }
    input = JSON.stringify(raw)
    compiled = JSON.stringify({
      ...compileModerationPolicy(raw).policy,
      revision: 1,
    })
    if (compiled.length > 65536) break
  }
  assert.ok(input.length <= 65536 && compiled.length > 65536)
  await assert.rejects(
    f.alice.mutation(api.moderationPolicies.save, {
      platform: "discord",
      scopeId: discordGuildId,
      policyJSON: input,
      expectedRevision: 0,
      enforcement: false,
    }),
    /too large/
  )
  assert.equal(
    await f.t.run((ctx) => ctx.db.query("discordModerationPolicies").first()),
    null
  )
})

test("disabled community rollout makes periodic role bootstrap inert", async () => {
  const f = await fixture()
  await f.t.mutation(internal.communityRoles.bootstrap, {})
  assert.deepEqual(
    await f.t.run((ctx) => ctx.db.query("communityRoleJobs").collect()),
    []
  )
  assert.deepEqual(
    await f.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    ),
    []
  )
})

for (const mode of ["consent", "providerFailure", "replacement"] as const) {
  test(`Clerk disconnect preserves authorization and revision fencing: ${mode}`, async (t) => {
    const f = await fixture()
    await f.t.mutation(internal.discordConnections.connectClerk, {
      userId: f.userId,
      discordUserId,
      expiresAt: Date.now() + 3600000,
    })
    const before = await f.t.query(internal.discordConnections.connection, {
      userId: f.userId,
    })
    assert.ok(before)
    const originalFetch = globalThis.fetch
    t.after(() => {
      globalThis.fetch = originalFetch
    })
    let deletes = 0
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "DELETE") {
        deletes++
        assert.fail("No remote deletion without a validated grant")
      }
      if (url.endsWith("/users/alice")) {
        if (mode === "replacement")
          await f.t.run((ctx) =>
            ctx.db.patch(before._id, { revision: before.revision + 1 })
          )
        if (mode === "providerFailure")
          return new Response("unavailable", { status: 503 })
        return Response.json({
          id: "alice",
          external_accounts: [
            { provider: "oauth_discord", provider_user_id: discordUserId },
          ],
        })
      }
      if (url.includes("oauth_access_tokens"))
        return Response.json([{ token: "clerk-token" }])
      assert.ok(url.endsWith("/oauth2/@me"))
      return Response.json({
        application: { id: "888888888888888888" },
        user: { id: discordUserId },
        scopes: ["identify"],
        expires: new Date(Date.now() + 3600000).toISOString(),
      })
    }
    await assert.rejects(
      f.t.action(api.communityActions.disconnectLinkedRoles, {}),
      /authenticated|signed in/i
    )
    assert.equal(
      (
        await f.t.query(internal.discordConnections.connection, {
          userId: f.userId,
        })
      )?.revokedAt,
      undefined
    )
    if (mode === "providerFailure")
      await assert.rejects(
        f.alice.action(api.communityActions.disconnectLinkedRoles, {}),
        /unavailable/
      )
    else await f.alice.action(api.communityActions.disconnectLinkedRoles, {})
    const after = await f.t.query(internal.discordConnections.connection, {
      userId: f.userId,
    })
    assert.ok(after)
    if (mode === "replacement") assert.equal(after.revokedAt, undefined)
    else {
      assert.ok(after.revokedAt)
      assert.equal(after.leaseUntil, 0)
      assert.equal(await f.alice.query(api.discordConnections.status, {}), null)
    }
    assert.equal(after.revision, before.revision + 1)
    assert.equal(deletes, 0)
  })
}

test("Linked Roles disconnect rejects busy leases, releases failed attempts and revokes on retry", async (t) => {
  const f = await fixture()
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  const { encryptDiscordTokens } = await import("./lib/integrationSecurity")
  const tokens = encryptDiscordTokens(
    JSON.stringify({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
      scope: "identify role_connections.write",
      token_type: "Bearer",
    })
  )
  assert.equal(
    await f.alice.action(api.communityActions.disconnectLinkedRoles, {}),
    null
  )
  await f.t.mutation(internal.discordConnections.storeTokens, {
    userId: f.userId,
    discordUserId,
    encryptedTokens: tokens,
    expiresAt: Date.now() + 3600000,
  })
  const lease = await f.t.mutation(internal.discordConnections.lease, {
    userId: f.userId,
  })
  assert.ok(lease)
  let fail = true,
    requests = 0
  globalThis.fetch = async () => {
    requests++
    if (fail) return new Response("unavailable", { status: 503 })
    return new Response(null, { status: 204 })
  }
  await assert.rejects(
    f.alice.action(api.communityActions.disconnectLinkedRoles, {}),
    /Retry disconnecting/
  )
  assert.equal(requests, 0)
  assert.equal(
    (
      await f.t.query(internal.discordConnections.connection, {
        userId: f.userId,
      })
    )?.revokedAt,
    undefined
  )
  await f.t.mutation(internal.discordConnections.release, {
    userId: f.userId,
    revision: lease.revision,
  })
  await assert.rejects(
    f.alice.action(api.communityActions.disconnectLinkedRoles, {})
  )
  assert.equal(
    (
      await f.t.query(internal.discordConnections.connection, {
        userId: f.userId,
      })
    )?.leaseUntil,
    0
  )
  fail = false
  await f.alice.action(api.communityActions.disconnectLinkedRoles, {})
  const disconnected = await f.t.query(internal.discordConnections.connection, {
    userId: f.userId,
  })
  assert.ok(disconnected?.revokedAt)
  assert.equal(disconnected.encryptedTokens, "")
  const before = requests
  await f.alice.action(api.communityActions.disconnectLinkedRoles, {})
  assert.equal(requests, before)
})

test("Checkout recovery retries beyond the old cap and closes only after verified provider expiry", async (t) => {
  const f = await purchased()
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  await f.t.mutation(internal.premiumPurchases.checkoutCreated, {
    key: f.reservation.key,
    sessionId: "cs_recover",
    url: "https://checkout.stripe.com/recover",
    expiresAt: Date.now() - 1,
  })
  let available = false
  globalThis.fetch = async () => {
    if (!available) throw new Error("Stripe outage after expiry")
    return Response.json({ status: "expired", subscription: null })
  }
  const before = await f.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  )
  await f.t.action(internal.premiumActions.recoverCheckout, {
    key: f.reservation.key,
    attempt: 13,
  })
  const after = await f.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  )
  assert.equal(after.length, before.length + 1)
  const retry = after.find((job) => !before.some((old) => old._id === job._id))!
  assert.ok(retry.scheduledTime >= Date.now() + 3599000)
  assert.equal(
    (
      await f.t.query(internal.premiumPurchases.checkoutByKey, {
        key: f.reservation.key,
      })
    )?.closedAt,
    undefined
  )
  available = true
  await f.t.action(internal.premiumActions.recoverCheckout, {
    key: f.reservation.key,
    attempt: 13,
  })
  assert.ok(
    (
      await f.t.query(internal.premiumPurchases.checkoutByKey, {
        key: f.reservation.key,
      })
    )?.closedAt
  )
  let fetches = 0
  globalThis.fetch = async () => {
    fetches++
    throw new Error("closed reservation must not fetch")
  }
  await f.t.action(internal.premiumActions.recoverCheckout, {
    key: f.reservation.key,
    attempt: 13,
  })
  assert.equal(fetches, 0)
})

test("pre-request reservations can be replaced but in-flight or ambiguous Checkout creation remains fenced", async () => {
  const f = await purchased()
  await f.t.run((ctx) =>
    ctx.db.patch(f.reservation._id, { expiresAt: Date.now() + 1000 })
  )
  const args = {
    userId: f.userId,
    discordUserId,
    discordGuildId,
    purchaserKind: "administrator" as const,
    announce: false,
    displayRole: false,
    key: "replacement",
  }
  const replacement = await f.t.mutation(
    internal.premiumPurchases.reserve,
    args
  )
  assert.equal(replacement.key, "replacement")
  assert.ok(replacement.expiresAt > Date.now() + 3599000)
  await assert.rejects(
    f.t.mutation(internal.premiumPurchases.beginCheckout, {
      key: f.reservation.key,
    }),
    /changed/
  )
  await assert.rejects(
    f.t.mutation(internal.premiumPurchases.checkoutCreated, {
      key: f.reservation.key,
      sessionId: "late",
      url: "https://checkout.stripe.com/late",
      expiresAt: Date.now() + 3600000,
    })
  )
  await f.t.mutation(internal.premiumPurchases.beginCheckout, {
    key: replacement.key,
  })
  const retries = await Promise.all(
    ["concurrent-one", "concurrent-two"].map((key) =>
      f.t.mutation(internal.premiumPurchases.reserve, { ...args, key })
    )
  )
  assert.ok(retries.every((row) => row.key === replacement.key))
  await assert.rejects(
    f.t.mutation(internal.premiumPurchases.reserve, {
      ...args,
      key: "changed-consent",
      announce: true,
    }),
    /already in progress/
  )
  await f.t.run((ctx) =>
    ctx.db.patch(replacement._id, { expiresAt: Date.now() + 1804999 })
  )
  await assert.rejects(
    f.t.mutation(internal.premiumPurchases.beginCheckout, {
      key: replacement.key,
    }),
    /awaiting reconciliation/
  )
})

test("Checkout retries definitive validation failures and fences uncertain concurrent Stripe requests", async (t) => {
  const f = await fixture(),
    originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  let mode: "invalid" | "outage" | "stalled" | "conflict" = "invalid"
  const keys: string[] = []
  let started: () => void = () => {},
    finish: () => void = () => {}
  const began = new Promise<void>((resolve) => {
    started = resolve
  })
  const waiting = new Promise<void>((resolve) => {
    finish = resolve
  })
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.startsWith("https://api.clerk.com/"))
      return Response.json([{ token: "fixture-oauth" }])
    if (url.endsWith("/users/@me")) return Response.json({ id: discordUserId })
    if (url.includes("/users/@me/guilds"))
      return Response.json([
        { id: discordGuildId, owner: false, permissions: "8" },
      ])
    if (new URL(url).pathname === `/api/v10/guilds/${discordGuildId}`)
      return Response.json({
        id: discordGuildId,
        owner_id: "444444444444444444",
        name: "Test",
      })
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions")
    const fields = new URLSearchParams(String(init?.body))
    keys.push(fields.get("metadata[cleo_checkout]")!)
    assert.ok(Number(fields.get("expires_at")) * 1000 >= Date.now() + 1800000)
    if (mode === "invalid")
      return Response.json(
        { error: { type: "invalid_request_error" } },
        { status: 400 }
      )
    if (mode === "outage") throw new Error("ambiguous Stripe timeout")
    if (mode === "conflict")
      return Response.json(
        { error: { type: "idempotency_error" } },
        { status: 409 }
      )
    started()
    await waiting
    return Response.json({
      id: "cs_concurrent",
      url: "https://checkout.stripe.com/concurrent",
      expires_at: Number(fields.get("expires_at")),
    })
  }
  const args = { discordGuildId, announce: false, displayRole: false }
  await assert.rejects(f.alice.action(api.premiumActions.checkout, args), /400/)
  assert.ok(
    (
      await f.t.query(internal.premiumPurchases.checkoutByKey, {
        key: keys[0]!,
      })
    )?.closedAt
  )
  mode = "outage"
  await assert.rejects(
    f.alice.action(api.premiumActions.checkout, { ...args, announce: true }),
    /timeout/
  )
  assert.notEqual(keys[0], keys[1])
  await assert.rejects(
    f.alice.action(api.premiumActions.checkout, args),
    /already in progress/
  )
  assert.equal(keys.length, 2)
  mode = "stalled"
  const first = f.alice.action(api.premiumActions.checkout, {
    ...args,
    announce: true,
  })
  await began
  mode = "conflict"
  await assert.rejects(
    f.alice.action(api.premiumActions.checkout, { ...args, announce: true }),
    /409/
  )
  assert.equal(keys[1], keys[2])
  assert.equal(keys[2], keys[3])
  assert.equal(
    (
      await f.t.query(internal.premiumPurchases.checkoutByKey, {
        key: keys[1]!,
      })
    )?.closedAt,
    undefined
  )
  finish()
  assert.equal(await first, "https://checkout.stripe.com/concurrent")
  assert.equal(
    await f.alice.action(api.premiumActions.checkout, {
      ...args,
      announce: true,
    }),
    "https://checkout.stripe.com/concurrent"
  )
  assert.equal(keys.length, 4)
})

test("Stripe reconciliation releases failures, acknowledges unmanaged webhooks and serializes concurrent work", async (t) => {
  const f = await purchased()
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  const now = Math.floor(Date.now() / 1000)
  const subscription = {
    id: "sub_recovery",
    customer: "cus_alice",
    status: "active",
    cancel_at_period_end: false,
    metadata: { cleo_checkout: f.reservation.key },
    items: {
      data: [
        {
          current_period_start: now - 10,
          current_period_end: now + 3600,
          price: { id: "price_premium", product: "prod_premium" },
        },
      ],
    },
  }
  let mode:
    | "offline"
    | "schema"
    | "association"
    | "invoice"
    | "payment"
    | "charge"
    | "unmanaged"
    | "success"
    | "stalled" = "offline"
  let started: () => void = () => {},
    finish: () => void = () => {}
  const began = new Promise<void>((resolve) => {
    started = resolve
  })
  const waiting = new Promise<void>((resolve) => {
    finish = resolve
  })
  globalThis.fetch = async (input) => {
    if (mode === "offline") throw new Error("Stripe unavailable")
    const url = String(input)
    if (url.includes("/invoices/")) {
      if (mode === "invoice") throw new Error("invoice lookup unavailable")
      return Response.json({
        id: "invoice_recovery",
        amount_paid: 1000,
        status: "paid",
        period_end: now + 3600,
        parent: { subscription_details: { subscription: subscription.id } },
        lines: {
          has_more: false,
          data: [
            {
              period: { start: now - 10, end: now + 3600 },
              parent: {
                subscription_item_details: { subscription: subscription.id },
              },
            },
          ],
        },
        payments: {
          has_more: false,
          data: [
            {
              status: "paid",
              amount_paid: 1000,
              payment: {
                type: "payment_intent",
                payment_intent: "pi_recovery",
              },
            },
          ],
        },
      })
    }
    if (url.includes("/payment_intents/")) {
      if (mode === "payment") throw new Error("payment lookup unavailable")
      return Response.json({
        status: "succeeded",
        customer: "cus_alice",
        amount_received: 1000,
        latest_charge: "ch_recovery",
      })
    }
    if (url.includes("/charges/")) throw new Error("charge lookup unavailable")
    if (mode === "schema")
      return Response.json({
        id: subscription.id,
        metadata: { cleo_checkout: f.reservation.key },
      })
    if (mode === "association")
      return Response.json({
        ...subscription,
        metadata: { cleo_checkout: "missing-trusted-checkout" },
      })
    if (mode === "invoice" || mode === "payment" || mode === "charge")
      return Response.json({
        ...subscription,
        latest_invoice: "invoice_recovery",
      })
    if (mode === "stalled") {
      started()
      await waiting
    }
    return Response.json(
      mode === "unmanaged" || mode === "stalled"
        ? { id: subscription.id, metadata: {} }
        : subscription
    )
  }
  const args = {
    subscriptionId: subscription.id,
    eventId: "recover-failed-event",
    revoked: false,
  }
  for (const [failure, expected] of [
    ["offline", /Stripe unavailable/],
    ["schema", /"path":\s*\[\s*"customer"\s*\]/],
    ["association", /Untrusted Stripe subscription association/],
    ["invoice", /invoice lookup unavailable/],
    ["payment", /payment lookup unavailable/],
    ["charge", /charge lookup unavailable/],
  ] as const) {
    mode = failure
    await assert.rejects(
      f.t.action(internal.premiumActions.reconcile, args),
      expected
    )
    assert.equal(
      await f.t.mutation(internal.premiumPurchases.acquire, {
        subscriptionId: subscription.id,
        worker: "retry",
      }),
      true
    )
    await f.t.mutation(internal.premiumPurchases.release, {
      subscriptionId: subscription.id,
      worker: "retry",
    })
  }
  mode = "unmanaged"
  const body = JSON.stringify({
    id: "unmanaged-webhook",
    type: "customer.subscription.updated",
    livemode: false,
    data: { object: { id: subscription.id } },
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = `t=${timestamp},v1=${createHmac("sha256", "whsec_fixture").update(`${timestamp}.${body}`).digest("hex")}`
  assert.equal(
    await f.t.action(internal.premiumActions.webhook, { body, signature }),
    true
  )
  assert.equal(
    await f.t.run((ctx) => ctx.db.query("guildSubscriptions").first()),
    null
  )
  mode = "stalled"
  const first = f.t.action(internal.premiumActions.reconcile, args)
  await began
  await assert.rejects(
    f.t.action(internal.premiumActions.reconcile, args),
    /in progress/
  )
  finish()
  await first
  mode = "success"
  await f.t.action(internal.premiumActions.reconcile, args)
  assert.ok(await f.t.run((ctx) => ctx.db.query("guildSubscriptions").first()))
  await f.t.mutation(internal.premiumPurchases.acquire, {
    subscriptionId: subscription.id,
    worker: "replacement-worker",
  })
  await f.t.mutation(internal.premiumPurchases.release, {
    subscriptionId: subscription.id,
    worker: "obsolete-worker",
  })
  assert.equal(
    await f.t.mutation(internal.premiumPurchases.acquire, {
      subscriptionId: subscription.id,
      worker: "racer",
    }),
    false
  )
})

test("test-mode hosted Checkout verifies fresh Administrator permission and signed Basil invoices reconcile real payment evidence", async () => {
  const f = await fixture(),
    original = globalThis.fetch
  const now = Math.floor(Date.now() / 1000),
    end = now + 3600
  let permission = "8",
    refunded = false,
    checkoutPosts = 0,
    key = ""
  const invoice = {
    id: "in_fixture",
    amount_paid: 1000,
    status: "paid",
    period_end: now,
    parent: { subscription_details: { subscription: "sub_fixture" } },
    lines: {
      has_more: false,
      data: [
        {
          period: { start: now - 10, end },
          parent: {
            subscription_item_details: { subscription: "sub_fixture" },
          },
        },
      ],
    },
    payments: {
      has_more: false,
      data: [
        {
          status: "paid",
          amount_paid: 1000,
          payment: { type: "payment_intent", payment_intent: "pi_fixture" },
        },
      ],
    },
  }
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (
      url.startsWith("https://api.clerk.com/") &&
      url.includes("oauth_access_tokens")
    )
      return Response.json([{ token: "fixture-oauth" }])
    if (url.endsWith("/users/@me")) return Response.json({ id: discordUserId })
    if (url.includes("/users/@me/guilds"))
      return Response.json([
        { id: discordGuildId, owner: false, permissions: permission },
      ])
    if (new URL(url).pathname === `/api/v10/guilds/${discordGuildId}`)
      return Response.json({
        id: discordGuildId,
        name: "Test community",
        owner_id: "444444444444444444",
      })
    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      checkoutPosts++
      const fields = new URLSearchParams(String(init?.body))
      key = fields.get("subscription_data[metadata][cleo_checkout]") ?? ""
      assert.equal(fields.get("customer"), "cus_alice")
      assert.equal(fields.get("line_items[0][price]"), "price_premium")
      assert.ok(
        new Headers(init?.headers).get("Idempotency-Key")?.includes(key)
      )
      return Response.json({
        id: "cs_fixture",
        url: "https://checkout.stripe.com/fixture",
        expires_at: end,
      })
    }
    if (url.endsWith("/subscriptions/sub_fixture"))
      return Response.json({
        id: "sub_fixture",
        customer: "cus_alice",
        status: "active",
        cancel_at_period_end: false,
        latest_invoice: "in_fixture",
        metadata: { cleo_checkout: key },
        items: {
          data: [
            {
              current_period_start: now - 10,
              current_period_end: end,
              price: { id: "price_premium", product: "prod_premium" },
            },
          ],
        },
      })
    if (url.includes("/invoices/in_fixture")) return Response.json(invoice)
    if (url.endsWith("/payment_intents/pi_fixture"))
      return Response.json({
        status: "succeeded",
        customer: "cus_alice",
        amount_received: 1000,
        latest_charge: "ch_fixture",
      })
    if (url.endsWith("/charges/ch_fixture"))
      return Response.json({
        customer: "cus_alice",
        payment_intent: "pi_fixture",
        paid: true,
        refunded,
        disputed: false,
        amount_refunded: refunded ? 1000 : 0,
      })
    throw new Error("Unexpected payment fixture request")
  }
  async function webhook(id: string, type: string, object: unknown) {
    const body = JSON.stringify({
        id,
        type,
        livemode: false,
        data: { object },
      }),
      timestamp = String(Math.floor(Date.now() / 1000))
    const signature = `t=${timestamp},v1=${createHmac("sha256", "whsec_fixture").update(`${timestamp}.${body}`).digest("hex")}`
    return f.t.action(internal.premiumActions.webhook, { body, signature })
  }
  try {
    const purchase = { discordGuildId, announce: false, displayRole: false }
    assert.equal(
      await f.alice.action(api.premiumActions.checkout, purchase),
      "https://checkout.stripe.com/fixture"
    )
    assert.equal(
      await f.alice.action(api.premiumActions.checkout, purchase),
      "https://checkout.stripe.com/fixture"
    )
    assert.equal(checkoutPosts, 1)
    assert.equal(
      (await f.alice.query(api.premiumPurchases.view, {})).subscriptions.length,
      0
    )
    permission = "32"
    await assert.rejects(
      f.alice.action(api.premiumActions.checkout, purchase),
      /Administrator/
    )
    assert.equal(await webhook("evt_paid", "invoice.paid", invoice), true)
    const view = await f.alice.query(api.premiumPurchases.view, {})
    assert.equal(view.subscriptions[0]?.active, true)
    assert.equal(view.subscriptions[0]?.testMode, true)
    assert.equal(
      (await f.alice.query(api.communityRoles.current, {}))?.premiumSupporter,
      "notEligible"
    )
    assert.equal(await webhook("evt_paid", "invoice.paid", invoice), true)
    assert.equal(
      (await f.t.run((ctx) => ctx.db.query("communityPayments").collect()))
        .length,
      1
    )
    refunded = true
    assert.equal(
      await webhook("evt_refund", "charge.refunded", {
        id: "ch_fixture",
        payment_intent: "pi_fixture",
      }),
      true
    )
    assert.equal(
      (await f.alice.query(api.premiumPurchases.view, {})).subscriptions[0]
        ?.active,
      false
    )
  } finally {
    globalThis.fetch = original
  }
})

test("Linked Role OAuth binds the current Discord identity and publishes exactly five server-authoritative fields", async () => {
  const f = await fixture()
  const original = globalThis.fetch
  const writes: unknown[] = []
  let identity = discordUserId
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith("/oauth2/token"))
      return Response.json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
        scope: "identify role_connections.write",
      })
    if (url.endsWith("/users/@me")) return Response.json({ id: identity })
    if (url.includes("oauth_access_tokens"))
      return Response.json([{ token: "fixture-clerk-oauth" }])
    if (url.includes("/users/@me/guilds"))
      return Response.json([
        { id: discordGuildId, owner: false, permissions: "8" },
      ])
    if (url.endsWith("/role-connection") && init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)))
      return Response.json({})
    }
    throw new Error("Unexpected external fixture request")
  }
  try {
    const url = new URL(
      await f.alice.action(api.communityActions.beginLinkedRoles, {})
    )
    const state = url.searchParams.get("state")
    assert.ok(state)
    assert.equal(
      url.searchParams.get("scope"),
      "identify role_connections.write"
    )
    const session = await f.t.run((ctx) =>
      ctx.db.query("discordConnectionSessions").first()
    )
    assert.notEqual(session?.stateHash, state)
    await f.alice.action(api.communityActions.finishLinkedRoles, {
      code: "verified-code",
      state,
    })
    const stored = await f.t.query(internal.discordConnections.connection, {
      userId: f.userId,
    })
    assert.ok(stored && !stored.encryptedTokens.includes("fixture-refresh"))
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0], {
      platform_name: "Cleo",
      metadata: {
        personal_premium: "0",
        creator_pro: "0",
        community_owner_tier: "0",
        community_manager_tier: "1",
        premium_supporter: "0",
      },
    })
    await assert.rejects(
      f.alice.action(api.communityActions.finishLinkedRoles, {
        code: "replay",
        state,
      })
    )
    const mismatch = new URL(
      await f.alice.action(api.communityActions.beginLinkedRoles, {})
    ).searchParams.get("state")!
    identity = "555555555555555555"
    await assert.rejects(
      f.alice.action(api.communityActions.finishLinkedRoles, {
        code: "wrong-user",
        state: mismatch,
      }),
      /identity/
    )
  } finally {
    globalThis.fetch = original
  }
})

test("signed application webhooks distinguish user and guild installation and reject tampering", async () => {
  const f = await fixture()
  async function receive(
    integrationType: number,
    type = "APPLICATION_AUTHORIZED",
    tamper = false
  ) {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({
      type: 1,
      application_id: process.env.DISCORD_APPLICATION_ID,
      event: {
        type,
        timestamp: new Date(Date.now() - 1).toISOString(),
        data: {
          integration_type: integrationType,
          user: { id: discordUserId },
        },
      },
    })
    const signature = sign(
      null,
      Buffer.from(timestamp + body),
      webhookKeys.privateKey
    ).toString("hex")
    return f.t.action(internal.discordApplicationWebhooks.receive, {
      body: tamper ? body + " " : body,
      signature,
      timestamp,
    })
  }
  assert.equal(await receive(0), true)
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "notEligible"
  )
  assert.equal(await receive(1, "APPLICATION_AUTHORIZED", true), false)
  assert.equal(await receive(1), true)
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "eligible"
  )
  assert.equal(await receive(1, "APPLICATION_DEAUTHORIZED"), true)
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "verificationNeeded"
  )
})

test("moderation saves require verified scope authority, validate limits, and use revision concurrency", async () => {
  const f = await fixture()
  const args = {
    platform: "discord" as const,
    scopeId: discordGuildId,
    policyJSON: "{}",
    expectedRevision: 0,
    enforcement: false,
  }
  await assert.rejects(f.t.mutation(api.moderationPolicies.save, args))
  await assert.rejects(f.bob.mutation(api.moderationPolicies.save, args))
  assert.equal(await f.alice.mutation(api.moderationPolicies.save, args), 1)
  await assert.rejects(
    f.alice.mutation(api.moderationPolicies.save, args),
    /Policy changed/
  )
  await assert.rejects(
    f.alice.mutation(api.moderationPolicies.save, {
      ...args,
      expectedRevision: 1,
      policyJSON: JSON.stringify({
        rules: {
          blockedWords: {
            entries: Array.from({ length: 51 }, (_, i) => ({
              term: `word${i}`,
            })),
          },
        },
      }),
    })
  )
  const saved = await f.alice.query(api.moderationPolicies.get, {
    platform: args.platform,
    scopeId: args.scopeId,
  })
  assert.ok(saved.status === "ready")
  assert.equal(saved.enforcement, false)
  assert.equal(
    (
      await f.bob.query(api.moderationPolicies.get, {
        platform: "twitch",
        scopeId: "222",
      })
    ).status,
    "unavailable"
  )
  assert.equal(
    await f.alice.mutation(api.moderationPolicies.save, {
      ...args,
      platform: "twitch",
      scopeId: "222",
    }),
    1
  )
  await f.t.run((ctx) =>
    ctx.db.patch(f.membershipId, { managementVerifiedAt: Date.now() - 300001 })
  )
  await assert.rejects(
    f.alice.mutation(api.moderationPolicies.save, {
      ...args,
      expectedRevision: 1,
    }),
    /Refresh/
  )
})

test("only one runtime owns enforcement; permission loss and bot removal revoke authority", async () => {
  const f = await fixture()
  await f.alice.mutation(api.moderationPolicies.save, {
    platform: "discord",
    scopeId: discordGuildId,
    policyJSON: "{}",
    expectedRevision: 0,
    enforcement: false,
  })
  // Internal fixtures exercise the future runtime; public activation is locked separately below.
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("discordModerationPolicies").first()
    assert.ok(row)
    await ctx.db.patch(row._id, { enforcement: true })
  })
  const first = await f.t.mutation(internal.moderationPolicies.runtime, {
    platform: "discord",
    scopeId: discordGuildId,
    worker: "first",
  })
  const second = await f.t.mutation(internal.moderationPolicies.runtime, {
    platform: "discord",
    scopeId: discordGuildId,
    worker: "second",
  })
  assert.equal(first?.leaseDurationMs, 60000)
  assert.equal(second?.leaseDurationMs, 0)
  const claim = {
    platform: "discord" as const,
    scopeId: discordGuildId,
    worker: "first",
    revision: 1,
    messageId: "message",
  }
  assert.equal(
    await f.t.mutation(internal.moderationPolicies.claimEnforcement, claim),
    true
  )
  assert.equal(
    await f.t.mutation(internal.moderationPolicies.claimEnforcement, claim),
    false
  )
  await f.t.run((ctx) => ctx.db.patch(f.guildId, { botLeftAt: Date.now() }))
  assert.equal(
    (
      await f.t.mutation(internal.moderationPolicies.runtime, {
        platform: "discord",
        scopeId: discordGuildId,
        worker: "first",
      })
    )?.enforcement,
    false
  )
})
test("moderation release lock cannot be bypassed by dashboard API calls or environment flags", async () => {
  const f = await fixture()
  const args = {
    platform: "discord" as const,
    scopeId: discordGuildId,
    policyJSON: "{}",
    expectedRevision: 0,
    enforcement: true,
  }
  await assert.rejects(
    f.alice.mutation(api.moderationPolicies.save, args),
    /not available/
  )
  await assert.rejects(
    f.alice.mutation(api.moderationPolicies.save, {
      ...args,
      enforcement: false,
      policyJSON: JSON.stringify({ rules: { links: { enabled: true } } }),
    }),
    /not available/
  )
  assert.equal(
    await f.t.action(api.moderationActions.runtime, {
      secret: "fixture-bot-secret",
      platform: "discord",
      scopeId: discordGuildId,
      worker: "bot",
    }),
    null
  )
  assert.equal(
    await f.t.action(api.moderationActions.runtime, {
      secret: "fixture-worker-secret",
      platform: "twitch",
      scopeId: "222",
      worker: "worker",
    }),
    null
  )
  assert.equal(
    await f.t.action(api.moderationActions.claimDiscord, {
      secret: "fixture-bot-secret",
      scopeId: discordGuildId,
      worker: "bot",
      revision: 1,
      messageId: "message",
    }),
    false
  )
  await assert.rejects(
    f.t.action(api.moderationActions.enforceTwitch, {
      secret: "fixture-worker-secret",
      scopeId: "222",
      worker: "worker",
      revision: 1,
      authorId: "333",
      messageId: "message",
      actionJSON: '{"kind":"delete"}',
    }),
    /not available/
  )
  await assert.rejects(
    f.alice.mutation(
      api.mutations.dashboard.discord.guildConfigs.updateModules.update,
      { discordGuildId, modules: { moderationEnabled: true } }
    ),
    /cannot be enabled/
  )
  await assert.rejects(
    f.alice.mutation(
      api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection
        .update,
      { discordGuildId, modules: { moderationEnabled: true }, channels: {} }
    ),
    /cannot be enabled/
  )
})

test("OAuth state is single-use, identity bound and expires; refresh leases and revisions serialize tokens", async () => {
  const f = await fixture()
  const begin = {
    userId: f.userId,
    discordUserId,
    stateHash: "state",
    purpose: "roles" as const,
  }
  await f.t.mutation(internal.discordConnections.begin, begin)
  await assert.rejects(
    f.t.mutation(internal.discordConnections.consume, {
      userId: f.otherId,
      stateHash: "state",
    })
  )
  assert.equal(
    await f.t.mutation(internal.discordConnections.consume, {
      userId: f.userId,
      stateHash: "state",
    }),
    discordUserId
  )
  await assert.rejects(
    f.t.mutation(internal.discordConnections.consume, {
      userId: f.userId,
      stateHash: "state",
    })
  )
  await f.t.mutation(internal.discordConnections.begin, begin)
  await f.t.run(async (ctx) => {
    const session = await ctx.db.query("discordConnectionSessions").first()
    assert.ok(session)
    await ctx.db.patch(session._id, { expiresAt: 1 })
  })
  await assert.rejects(
    f.t.mutation(internal.discordConnections.consume, {
      userId: f.userId,
      stateHash: "state",
    })
  )
  await f.t.mutation(internal.discordConnections.storeTokens, {
    userId: f.userId,
    discordUserId,
    encryptedTokens: "encrypted-fixture",
    expiresAt: Date.now() + 60000,
  })
  assert.ok(
    await f.t.mutation(internal.discordConnections.lease, { userId: f.userId })
  )
  assert.equal(
    await f.t.mutation(internal.discordConnections.lease, { userId: f.userId }),
    null
  )
  await assert.rejects(
    f.t.mutation(internal.discordConnections.storeTokens, {
      userId: f.userId,
      discordUserId,
      encryptedTokens: "old",
      expiresAt: Date.now(),
      expectedRevision: 0,
    })
  )
  await f.t.run((ctx) =>
    ctx.db.patch(f.linkId, { providerAccountId: "555555555555555555" })
  )
  await assert.rejects(
    f.t.mutation(internal.discordConnections.storeTokens, {
      userId: f.userId,
      discordUserId,
      encryptedTokens: "old",
      expiresAt: Date.now(),
      expectedRevision: 1,
    })
  )
  await f.t.mutation(internal.discordConnections.revoke, {
    userId: f.userId,
    expectedRevision: 1,
  })
  const connection = await f.t.query(internal.discordConnections.connection, {
    userId: f.userId,
  })
  assert.equal(connection?.encryptedTokens, "")
  assert.ok(connection?.revokedAt)
})

test("current installation evidence wins over reordered events; stale evidence cannot qualify", async () => {
  const f = await fixture(),
    now = Date.now()
  await f.t.mutation(internal.discordConnections.installation, {
    discordUserId,
    state: "active",
    evidenceAt: now - 10,
    eventKey: "install",
  })
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "eligible"
  )
  await f.t.mutation(internal.discordConnections.installation, {
    discordUserId,
    state: "uncertain",
    evidenceAt: now,
    eventKey: "remove",
  })
  await f.t.mutation(internal.discordConnections.installation, {
    discordUserId,
    state: "active",
    evidenceAt: now - 5,
    eventKey: "late",
  })
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "verificationNeeded"
  )
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("discordUserInstallations").first()
    assert.ok(row)
    await ctx.db.patch(row._id, { state: "active", expiresAt: 1 })
  })
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.discordBotUser,
    "verificationNeeded"
  )
})

test("role jobs preserve newer changes, independent owner/admin eligibility and revocations", async () => {
  const f = await fixture()
  const roles = await f.alice.query(api.communityRoles.current, {})
  assert.equal(roles?.communityManager, "eligible")
  assert.equal(roles?.communityOwner, "notEligible")
  assert.equal(roles?.personalPremium, "unavailable")
  await f.t.mutation(internal.communityRoles.enqueue, { discordUserId })
  const jobs = await f.t.mutation(internal.communityRoles.claim, {
    worker: "one",
  })
  assert.equal(jobs.length, 1)
  assert.deepEqual(
    await f.t.mutation(internal.communityRoles.claim, { worker: "two" }),
    []
  )
  await f.t.mutation(internal.communityRoles.refreshGuilds, {
    observedAt: Date.now(),
    userId: f.userId,
    discordUserId,
    guilds: [],
    reconciliation: true,
  })
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.communityManager,
    "notEligible"
  )
  await f.t.mutation(internal.communityRoles.enqueue, { discordUserId })
  assert.ok(jobs[0])
  await f.t.mutation(internal.communityRoles.settle, {
    id: jobs[0].id,
    revision: jobs[0].revision,
    worker: "one",
    success: true,
  })
  assert.equal(
    (await f.t.mutation(internal.communityRoles.claim, { worker: "two" }))
      .length,
    1
  )
})

async function purchased() {
  const f = await fixture(),
    now = Date.now()
  const reservation = await f.t.mutation(internal.premiumPurchases.reserve, {
    userId: f.userId,
    discordUserId,
    discordGuildId,
    purchaserKind: "administrator",
    announce: true,
    displayRole: true,
    key: "checkout",
  })
  const apply = {
    worker: "billing",
    subscriptionId: "sub_one",
    customerId: "cus_alice",
    checkoutKey: reservation.key,
    productId: "prod_premium",
    priceId: "price_premium",
    status: "active" as const,
    startsAt: now - 10000,
    endsAt: now + 3600000,
    cancelAtPeriodEnd: false,
    revoked: false,
    testMode: false,
    paidInvoice: {
      id: "invoice_one",
      paidUntil: now + 3600000,
      payments: [{ paymentIntentId: "pi_one", chargeId: "ch_one" }],
    },
  }
  return { ...f, reservation, apply }
}
test("checkout reservations prevent races; billing authority survives payer permission loss", async () => {
  const f = await purchased()
  await assert.rejects(
    f.t.mutation(internal.premiumPurchases.reserve, {
      userId: f.otherId,
      discordUserId,
      discordGuildId,
      purchaserKind: "owner",
      announce: false,
      displayRole: false,
      key: "race",
    })
  )
  assert.equal(
    await f.t.mutation(internal.premiumPurchases.acquire, {
      subscriptionId: "sub_one",
      worker: "billing",
    }),
    true
  )
  assert.equal(
    await f.t.mutation(internal.premiumPurchases.acquire, {
      subscriptionId: "sub_one",
      worker: "racer",
    }),
    false
  )
  await assert.rejects(
    f.t.mutation(internal.premiumPurchases.apply, {
      ...f.apply,
      eventId: "bad",
      customerId: "cus_wrong",
    })
  )
  await f.t.run((ctx) =>
    ctx.db.patch(f.membershipId, {
      canManage: false,
      revokedAt: Date.now(),
      permissions: "0",
    })
  )
  await f.t.mutation(internal.premiumPurchases.apply, {
    ...f.apply,
    eventId: "paid",
  })
  assert.equal(
    (await f.alice.query(api.premiumPurchases.view, {})).subscriptions[0]
      ?.active,
    true
  )
  assert.equal(
    (await f.bob.query(api.premiumPurchases.view, {})).subscriptions.length,
    0
  )
  const activation = await f.t.run((ctx) =>
    ctx.db.query("paidCommunityActivations").first()
  )
  assert.ok(activation)
  await assert.rejects(
    f.bob.mutation(api.premiumPurchases.preferences, {
      activationId: activation._id,
      announce: false,
      displayRole: false,
    })
  )
  await f.alice.mutation(api.premiumPurchases.preferences, {
    activationId: activation._id,
    announce: false,
    displayRole: false,
  })
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.premiumSupporter,
    "notEligible"
  )
})

test("paid reconciliation is idempotent; renewals never reannounce and refunds cannot be restored by old events", async () => {
  const f = await purchased()
  for (const eventId of ["paid", "paid", "renewal"]) {
    await f.t.mutation(internal.premiumPurchases.acquire, {
      subscriptionId: "sub_one",
      worker: "billing",
    })
    await f.t.mutation(internal.premiumPurchases.apply, { ...f.apply, eventId })
  }
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.query("communityAnnouncementOutbox").collect()
      )
    ).length,
    1
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("guildSubscriptions").collect()))
      .length,
    1
  )
  assert.equal(
    await f.t.query(internal.premiumPurchases.paymentSubscription, {
      chargeId: "ch_one",
    }),
    "sub_one"
  )
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.premiumSupporter,
    "eligible"
  )
  for (const [eventId, revoked] of [
    ["refund", true],
    ["late-paid", false],
  ] as const) {
    await f.t.mutation(internal.premiumPurchases.acquire, {
      subscriptionId: "sub_one",
      worker: "billing",
    })
    await f.t.mutation(internal.premiumPurchases.apply, {
      ...f.apply,
      eventId,
      revoked,
    })
  }
  assert.equal(
    (await f.alice.query(api.communityRoles.current, {}))?.premiumSupporter,
    "notEligible"
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("guildSubscriptions").first()))
      ?.status,
    "revoked"
  )
})

test("announcement delivery requires both consents; ambiguous delivery never becomes pending again", async () => {
  const f = await purchased()
  await f.t.mutation(internal.premiumPurchases.acquire, {
    subscriptionId: "sub_one",
    worker: "billing",
  })
  await f.t.mutation(internal.premiumPurchases.apply, {
    ...f.apply,
    eventId: "paid",
  })
  assert.equal(
    await f.t.mutation(internal.communityRecognition.claim, {
      attempt: "private",
    }),
    null
  )
  const row = await f.t.run((ctx) =>
    ctx.db.query("communityAnnouncementOutbox").first()
  )
  assert.equal(row?.state, "suppressed")
  assert.ok(row)
  await f.t.mutation(internal.premiumPurchases.communityConsent, {
    discordGuildId,
    publishIdentity: true,
  })
  await f.t.run((ctx) => ctx.db.patch(row._id, { state: "pending" }))
  const claimed = await f.t.mutation(internal.communityRecognition.claim, {
    attempt: "delivery",
  })
  assert.equal(claimed?.purchaserKind, "administrator")
  assert.equal(
    await f.t.mutation(internal.communityRecognition.claim, {
      attempt: "duplicate",
    }),
    null
  )
  await f.t.mutation(internal.communityRecognition.settle, {
    id: row._id,
    attempt: "wrong",
    messageId: "123",
  })
  await f.t.mutation(internal.communityRecognition.settle, {
    id: row._id,
    attempt: "delivery",
  })
  assert.equal(
    (await f.t.query(internal.communityRecognition.uncertain, {})).length,
    1
  )
  assert.equal(
    await f.t.mutation(internal.communityRecognition.claim, {
      attempt: "retry",
    }),
    null
  )
  await f.t.mutation(internal.communityRecognition.reconciled, {
    id: row._id,
    messageId: "verified",
  })
  assert.equal(
    (await f.t.query(internal.communityRecognition.uncertain, {})).length,
    0
  )
})

import assert from "node:assert/strict"
import { test, beforeEach, afterEach, mock } from "node:test"
import { convexTest } from "convex-test"
import { api, internal } from "./_generated/api"
import schema from "./schema"
const originalFetch = globalThis.fetch
beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
afterEach(() => mock.timers.reset())
process.env.TWITCH_CHAT_PRESENCE_ENABLED = "true"
process.env.TWITCH_CLIENT_ID = "timer-test-client"
process.env.TWITCH_BOT_USER_ID = "999"
process.env.TWITCH_WORKER_SECRET = "timer-test-worker"
process.env.TWITCH_CLIENT_SECRET = "timer-test-client-secret"
process.env.TWITCH_EVENTSUB_CALLBACK_URL = "https://dev.example/eventsub"
process.env.TWITCH_EVENTSUB_SECRET = "timer-test-eventsub-secret"
process.env.CLERK_SECRET_KEY = "timer-test-clerk-secret"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./twitchTimers.ts": () => import("./twitchTimers"),
  "./twitchTimerActions.ts": () => import("./twitchTimerActions"),
}
const config = {
  name: "Links",
  enabled: true,
  intervalMinutes: 5,
  minimumMessages: 1,
  messages: ["first", "second"],
}
test("metadata-only saves preserve durable rotation and ordered message edits reset it", async () => {
  const { t, owner } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  await t.run((ctx) => ctx.db.patch(id, { cursor: 1 }))
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    id,
    revision: 1,
    name: "Renamed",
    intervalMinutes: 10,
  })
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).groups[0]?.cursor,
    1
  )
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    id,
    revision: 2,
    messages: ["second", "first"],
  })
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).groups[0]?.cursor,
    0
  )
  await assert.rejects(
    owner.mutation(api.twitchTimers.save, {
      ...config,
      id,
      revision: 3,
      messages: ["  /me hello"],
    }),
    /Invalid/
  )
})
test("stream sessions reset every group only for a new stream and fence old claims", async () => {
  const { t, owner, userId } = await setup()
  await t.mutation(internal.twitchTimers.provisionTestGrant, {
    userId,
    broadcasterId: "222",
    expiresAt: Date.now() + 60000,
    reason: "lifecycle",
  })
  const ids = [
    await owner.mutation(api.twitchTimers.save, config),
    await owner.mutation(api.twitchTimers.save, config),
  ]
  const now = Date.now()
  const session = {
    broadcasterId: "222",
    streamId: "100",
    startedAt: now - 400000,
    observedAt: now,
  }
  assert.equal(await t.mutation(internal.twitchTimers.session, session), true)
  await readyRuntime(t)
  await readyChat(t, userId)
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  const evidence = await t.run(async (ctx) =>
    chatEvidence(await chatAccount(ctx, userId))
  )
  for (const id of ids)
    await t.run((ctx) =>
      ctx.db.patch(id, {
        cursor: 1,
        lastAttemptAt: now - 400000,
        sessionStartedAt: now - 400000,
      })
    )
  const claim = await t.mutation(internal.twitchTimers.claim, {
    id: ids[0]!,
    revision: 1,
    streamId: "100",
    evidence,
    verifiedAt: Date.now(),
  })
  assert.ok(claim)
  assert.equal(
    await t.mutation(internal.twitchTimers.begin, {
      id: ids[0]!,
      executionId: claim.executionId,
      streamId: "100",
    }),
    true
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.begin, {
      id: ids[0]!,
      executionId: claim.executionId,
      streamId: "100",
    }),
    false
  )
  await t.mutation(internal.twitchTimers.session, {
    ...session,
    observedAt: Date.now(),
  })
  assert.equal((await t.run((ctx) => ctx.db.get(ids[0]!)))?.cursor, 1)
  await t.mutation(internal.twitchTimers.session, {
    broadcasterId: "222",
    observedAt: Date.now(),
    eventAt: Date.now(),
  })
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).groups[0]?.sessionLive,
    false
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.claim, {
      id: ids[1]!,
      revision: 1,
      streamId: "100",
      evidence,
      verifiedAt: Date.now(),
    }),
    null
  )
  await t.mutation(internal.twitchTimers.session, {
    broadcasterId: "222",
    streamId: "101",
    startedAt: now,
    observedAt: Date.now(),
  })
  for (const id of ids) {
    const group = await t.run((ctx) => ctx.db.get(id))
    assert.equal(group?.cursor, 0)
    assert.equal(group?.lastAttemptAt, undefined)
    assert.equal(group?.lastSentAt, undefined)
  }
  await t.mutation(internal.twitchTimers.settle, {
    id: ids[0]!,
    executionId: claim.executionId,
    sent: true,
  })
  assert.equal((await t.run((ctx) => ctx.db.get(ids[0]!)))?.cursor, 0)
  assert.equal(
    await t.mutation(internal.twitchTimers.session, {
      broadcasterId: "222",
      observedAt: Date.now(),
      eventAt: now - 1,
    }),
    false
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.session, {
      ...session,
      observedAt: Date.now(),
    }),
    false
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.session, {
      broadcasterId: "333",
      observedAt: Date.now(),
    }),
    false
  )
  const subscriptions = await t.run((ctx) =>
    ctx.db.query("twitchEventSubscriptions").collect()
  )
  for (const key of ["streamOnline", "streamOffline"]) {
    assert.equal(subscriptions.filter((row) => row.key === key).length, 1)
    assert.deepEqual(subscriptions.find((row) => row.key === key)?.consumers, [
      `timer:${userId}:${key}`,
    ])
  }
})

test("an expired or crashed execution is quarantined; confirmed settlement is idempotent", async () => {
  const { t, owner, userId } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  await readyRuntime(t)
  await readyChat(t, userId)
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  const evidence = await t.run(async (ctx) =>
    chatEvidence(await chatAccount(ctx, userId))
  )
  const args = {
    id,
    revision: 1,
    streamId: "100",
    evidence,
    verifiedAt: Date.now(),
  }
  await t.run((ctx) => ctx.db.patch(id, { lastAttemptAt: Date.now() - 400000 }))
  const claim = await t.mutation(internal.twitchTimers.claim, args)
  assert.ok(claim)
  await t.run((ctx) =>
    ctx.db.patch(id, {
      execution: {
        id: claim.executionId,
        revision: 1,
        streamId: "100",
        cursor: 0,
        expiresAt: 1,
        phase: "prepared",
      },
    })
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.begin, {
      id,
      executionId: claim.executionId,
      streamId: "100",
    }),
    false
  )
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: claim.executionId,
    sent: false,
    definite: true,
  })
  const replacement = await t.mutation(internal.twitchTimers.claim, {
    ...args,
    verifiedAt: Date.now(),
  })
  assert.ok(replacement)
  await t.mutation(internal.twitchTimers.begin, {
    id,
    executionId: replacement.executionId,
    streamId: "100",
  })
  await t.run((ctx) =>
    ctx.db.patch(id, {
      lastAttemptAt: 1,
      execution: {
        id: replacement.executionId,
        revision: 1,
        streamId: "100",
        cursor: 0,
        expiresAt: 1,
        phase: "sending",
      },
    })
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.claim, {
      ...args,
      verifiedAt: Date.now(),
    }),
    null
  )
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: replacement.executionId,
    sent: false,
  })
  assert.equal(
    (await t.run((ctx) => ctx.db.get(id)))?.execution?.phase,
    "uncertain"
  )
  // A confirmed outcome remains valid after its lease expires when it is still
  // the owning execution. Repeating it models a committed-but-lost response.
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: replacement.executionId,
    sent: true,
  })
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: replacement.executionId,
    sent: true,
  })
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: replacement.executionId,
    sent: false,
  })
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.cursor, 1)
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.execution, undefined)
})

test("a confirmed in-flight send advances through metadata edits without advancing a changed rotation", async () => {
  const { t, owner, userId } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  await readyRuntime(t)
  await readyChat(t, userId)
  await t.run((ctx) => ctx.db.patch(id, { lastAttemptAt: Date.now() - 400000 }))
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  const claim = await t.mutation(internal.twitchTimers.claim, {
    id,
    revision: 1,
    streamId: "100",
    verifiedAt: Date.now(),
    evidence: await t.run(async (ctx) =>
      chatEvidence(await chatAccount(ctx, userId))
    ),
  })
  assert.ok(claim)
  await t.mutation(internal.twitchTimers.begin, {
    id,
    streamId: "100",
    executionId: claim.executionId,
  })
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    id,
    revision: 1,
    name: "Renamed",
  })
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: claim.executionId,
    sent: true,
  })
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.cursor, 1)
})

test("timer lifecycle consumers share Discord subscriptions and repair failed lifecycle subscriptions", async () => {
  const { t, owner, userId } = await setup()
  const { subscriptionIdentity } =
    await import("@workspace/shared/twitchEventSub")
  const subscription = await t.run(async (ctx) => {
    const id = await ctx.db.insert("twitchEventSubscriptions", {
      identity: subscriptionIdentity(
        "streamOnline",
        "222",
        "999",
        "https://dev.example/eventsub"
      ),
      key: "streamOnline",
      broadcasterId: "222",
      condition: { broadcaster_user_id: "222" },
      callback: "https://dev.example/eventsub",
      consumers: ["guild:discord"],
      revision: 1,
      status: "failed",
      updatedAt: 1,
    })
    await ctx.db.insert("twitchEventConsumers", {
      consumer: "guild:discord",
      subscription: id,
    })
    return id
  })
  const id = await owner.mutation(api.twitchTimers.save, config)
  await t.mutation(internal.twitchTimers.refreshLifecycle, { userId })
  assert.deepEqual(
    (await t.run((ctx) => ctx.db.get(subscription)))?.consumers,
    ["guild:discord", `timer:${userId}:streamOnline`]
  )
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    id,
    revision: 1,
    enabled: false,
  })
  assert.deepEqual(
    (await t.run((ctx) => ctx.db.get(subscription)))?.consumers,
    ["guild:discord"]
  )
})

test("claim preflight rejects revoked capacity without provider verification, including a prepared claim", async () => {
  const { t, owner, userId } = await setup()
  await t.mutation(internal.twitchTimers.provisionTestGrant, {
    userId,
    broadcasterId: "222",
    expiresAt: Date.now() + 60000,
    reason: "capacity race",
  })
  const id = await owner.mutation(api.twitchTimers.save, config)
  const second = await owner.mutation(api.twitchTimers.save, config)
  await readyRuntime(t)
  await readyChat(t, userId)
  await t.run((ctx) =>
    ctx.db.patch(second, { lastAttemptAt: Date.now() - 400000 })
  )
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  const evidence = await t.run(async (ctx) =>
    chatEvidence(await chatAccount(ctx, userId))
  )
  const claim = await t.mutation(internal.twitchTimers.claim, {
    id: second,
    revision: 1,
    streamId: "100",
    verifiedAt: Date.now(),
    evidence,
  })
  assert.ok(claim)
  await t.mutation(internal.twitchTimers.revokeTestGrant, { userId })
  assert.equal(
    await t.query(internal.twitchTimers.claimContext, {
      id: second,
      revision: 1,
      streamId: "100",
    }),
    null
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.begin, {
      id: second,
      streamId: "100",
      executionId: claim.executionId,
    }),
    false
  )
  await t.run(async (ctx) => {
    const runtime = await ctx.db.query("twitchBotRuntime").first()
    await ctx.db.delete(runtime!._id)
  })
  assert.equal(
    await t.query(internal.twitchTimers.claimContext, {
      id,
      revision: 1,
      streamId: "100",
    }),
    null
  )
  await t.mutation(internal.twitchTimers.session, {
    broadcasterId: "222",
    streamId: "101",
    startedAt: Date.now(),
    observedAt: Date.now(),
  })
  await owner.mutation(api.twitchTimers.remove, { id: second })
  const third = await owner.mutation(api.twitchTimers.save, {
    ...config,
    id,
    revision: 1,
    enabled: false,
  })
  assert.equal(third, id)
  await owner.mutation(api.twitchTimers.remove, { id })
  const newGroup = await owner.mutation(api.twitchTimers.save, config)
  assert.equal((await t.run((ctx) => ctx.db.get(newGroup)))?.streamId, "101")
})

test("missing lifecycle configuration persists offline edits and missing Clerk configuration fails closed", async (testContext) => {
  const { backendEnv } = await import("@workspace/env/backend")
  const descriptors = Object.getOwnPropertyDescriptors(backendEnv)
  testContext.after(() => Object.defineProperties(backendEnv, descriptors))
  Object.defineProperties(backendEnv, {
    TWITCH_EVENTSUB_CALLBACK_URL: { value: undefined, configurable: true },
    TWITCH_BOT_USER_ID: { value: undefined, configurable: true },
  })
  const { t, owner, userId } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  assert.equal((await owner.query(api.twitchTimers.list, {})).groups.length, 1)
  Object.defineProperties(backendEnv, descriptors)
  await readyRuntime(t)
  await readyChat(t, userId)
  await t.run((ctx) => ctx.db.patch(id, { lastAttemptAt: Date.now() - 400000 }))
  Object.defineProperty(backendEnv, "CLERK_SECRET_KEY", {
    value: undefined,
    configurable: true,
  })
  await assert.rejects(
    t.action(api.twitchTimerActions.claim, {
      secret: "timer-test-worker",
      id,
      revision: 1,
      streamId: "100",
    }),
    /provider unavailable/
  )
})

test("overlapping Convex-clock watermarks retain edits, deletes and inserts across pages", async () => {
  const { t, owner } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  const snapshot = await t.query(internal.twitchTimers.runtimePage, {})
  assert.ok(snapshot.startedAt <= Date.now() - 119000)
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    id,
    revision: 1,
    enabled: false,
  })
  // Model a mutation that started before the snapshot but committed afterward.
  await t.run((ctx) => ctx.db.patch(id, { updatedAt: snapshot.startedAt + 1 }))
  assert.equal(
    (
      await t.query(internal.twitchTimers.runtimePage, {
        since: snapshot.startedAt,
      })
    ).groups[0]?.enabled,
    false
  )
  await owner.mutation(api.twitchTimers.remove, { id })
  const replacement = await owner.mutation(api.twitchTimers.save, config)
  const delta = await t.query(internal.twitchTimers.runtimePage, {
    since: snapshot.startedAt,
  })
  assert.equal(
    delta.groups.find((group) => group.id === id)?.messages.length,
    0
  )
  assert.equal(
    delta.groups.find((group) => group.id === replacement)?.enabled,
    true
  )
})

test("configuration mutations committed between runtime pages survive the next overlapping refresh", async () => {
  const { t, owner } = await setup()
  const original = await owner.mutation(api.twitchTimers.save, config)
  const seeded = await t.run(async (ctx) => {
    const ids = []
    for (let i = 0; i < 100; i++) {
      const userId = await ctx.db.insert("users", {
        clerkUserId: `page-owner-${i}`,
        email: `${i}@example.com`,
        role: "user",
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert("linkedAccounts", {
        userId,
        provider: "twitch",
        providerAccountId: String(1000 + i),
        scopes: ["channel:bot"],
        createdAt: 1,
        updatedAt: 1,
      })
      ids.push(
        await ctx.db.insert("twitchTimerGroups", {
          ...config,
          userId,
          broadcasterId: String(1000 + i),
          order: 0,
          revision: 1,
          updatedAt: Date.now(),
          deleted: false,
          cursor: 0,
        })
      )
    }
    return ids
  })
  const first = await t.query(internal.twitchTimers.runtimePage, {})
  assert.ok(first.cursor)
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    id: original,
    revision: 1,
    name: "Concurrent edit",
  })
  await owner.mutation(api.twitchTimers.remove, { id: original })
  const created = await owner.mutation(api.twitchTimers.save, config)
  await t
    .withIdentity({ subject: "page-owner-0" })
    .mutation(api.twitchTimers.save, {
      ...config,
      id: seeded[0]!,
      revision: 1,
      enabled: false,
    })
  await t.run(async (ctx) => {
    for (const id of [original, created, seeded[0]!])
      await ctx.db.patch(id, { updatedAt: first.startedAt + 1 })
  })
  const last = await t.query(internal.twitchTimers.runtimePage, {
    cursor: first.cursor,
  })
  assert.equal(last.cursor, null)
  const delta = []
  let cursor: string | undefined
  do {
    const page = await t.query(internal.twitchTimers.runtimePage, {
      since: first.startedAt,
      cursor,
    })
    delta.push(...page.groups)
    cursor = page.cursor ?? undefined
  } while (cursor)
  assert.deepEqual(delta.find((group) => group.id === original)?.messages, [])
  assert.equal(delta.find((group) => group.id === seeded[0])?.enabled, false)
  assert.equal(delta.find((group) => group.id === created)?.enabled, true)
})

test("delayed verification stamps fresh evidence and a concurrent authorization change rejects the claim", async (testContext) => {
  const { t, owner, userId } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  await readyRuntime(t)
  const subscription = await readyChat(t, userId)
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { lastAttemptAt: Date.now() - 400000 })
  })
  let now = Date.now(),
    revoke = false,
    unavailable = false,
    permission = true
  testContext.mock.method(Date, "now", () => now)
  testContext.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (unavailable) throw new Error("provider outage")
    if (url.includes("oauth_access_tokens"))
      return Response.json([{ token: "test-only" }])
    if (url.includes("oauth2/validate")) {
      now += 20000
      if (revoke)
        await t.run((ctx) =>
          ctx.db.patch(subscription, {
            authorizationRevoked: true,
            status: "revoked",
          })
        )
      return Response.json({
        user_id: "222",
        login: "example",
        client_id: "timer-test-client",
        expires_in: 1000,
        scopes: permission ? ["channel:bot"] : [],
      })
    }
    return Response.json({
      id: "owner",
      external_accounts: [
        { provider: "oauth_discord", provider_user_id: "111" },
        { provider: "oauth_twitch", provider_user_id: "222" },
      ],
    })
  }
  const args = { secret: "timer-test-worker", id, revision: 1, streamId: "100" }
  const claim = await t.action(api.twitchTimerActions.claim, args)
  assert.ok(claim)
  await t.action(api.twitchTimerActions.settle, {
    secret: args.secret,
    id,
    executionId: claim.executionId,
    sent: false,
    definite: true,
  })
  permission = false
  assert.equal(await t.action(api.twitchTimerActions.claim, args), null)
  permission = true
  unavailable = true
  await assert.rejects(
    t.action(api.twitchTimerActions.claim, args),
    /provider unavailable/
  )
  unavailable = false
  revoke = true
  assert.equal(await t.action(api.twitchTimerActions.claim, args), null)
  await t.mutation(internal.twitchTimers.refreshLifecycle, { userId })
  assert.equal(
    await t.action(api.twitchTimerActions.begin, {
      secret: args.secret,
      id,
      executionId: "obsolete",
      streamId: "100",
    }),
    false
  )
  assert.equal(
    await t.action(api.twitchTimerActions.session, {
      secret: args.secret,
      broadcasterId: "222",
      streamId: "100",
      startedAt: now - 400000,
      observedAt: now,
    }),
    true
  )
})
async function setup() {
  const t = convexTest({ schema, modules })
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "owner",
      email: "a@example.com",
      role: "user",
      createdAt: 1,
      updatedAt: 1,
    })
  )
  await t.run((ctx) =>
    ctx.db.insert("linkedAccounts", {
      userId,
      provider: "twitch",
      providerAccountId: "222",
      scopes: ["channel:bot"],
      createdAt: 1,
      updatedAt: 1,
    })
  )
  const owner = t.withIdentity({ subject: "owner" })
  await t.run((ctx) =>
    ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId: "111",
      scopes: [],
      createdAt: 1,
      updatedAt: 1,
    })
  )
  return { t, owner, userId }
}
test("ownership, invalid inputs, concurrent free creation, test grants and lossless downgrades", async () => {
  const { t, owner, userId } = await setup()
  await assert.rejects(t.query(api.twitchTimers.list, {}), /signed in/)
  await assert.rejects(
    owner.mutation(api.twitchTimers.save, { ...config, intervalMinutes: 4 }),
    /Invalid/
  )
  const attempts = await Promise.allSettled([
    owner.mutation(api.twitchTimers.save, config),
    owner.mutation(api.twitchTimers.save, config),
  ])
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1)
  const first = (await owner.query(api.twitchTimers.list, {})).groups[0]!
  await assert.rejects(
    owner.mutation(api.twitchTimers.save, {
      ...config,
      id: first.id,
      revision: 0,
    }),
    /changed/
  )
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "attacker",
      email: "b@example.com",
      role: "user",
      createdAt: 1,
      updatedAt: 1,
    })
  )
  const attacker = t.withIdentity({ subject: "attacker" })
  await assert.rejects(
    attacker.mutation(api.twitchTimers.remove, { id: first.id }),
    /unavailable/
  )
  assert.equal(
    (await attacker.query(api.twitchTimers.list, {})).groups.length,
    0
  )
  const grant = {
    userId,
    broadcasterId: "222",
    expiresAt: Date.now() + 60000,
    reason: "QA",
  }
  await assert.rejects(
    t.mutation(internal.twitchTimers.provisionTestGrant, {
      ...grant,
      broadcasterId: "333",
    }),
    /Invalid/
  )
  await assert.rejects(
    t.mutation(internal.twitchTimers.provisionTestGrant, {
      ...grant,
      expiresAt: Date.now() + 31 * 86400_000,
    }),
    /Invalid/
  )
  await t.mutation(internal.twitchTimers.provisionTestGrant, grant)
  const secondId = await owner.mutation(api.twitchTimers.save, config)
  await owner.mutation(api.twitchTimers.save, config)
  await assert.rejects(
    owner.mutation(api.twitchTimers.save, config),
    /capacity/
  )
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).entitlement.source,
    "testGrant"
  )
  await t.mutation(internal.twitchTimers.revokeTestGrant, { userId })
  let view = await owner.query(api.twitchTimers.list, {})
  assert.deepEqual(
    view.groups.map((g) => g.locked),
    [false, true, true]
  )
  assert.equal(view.groups.length, 3)
  await assert.rejects(
    owner.mutation(api.twitchTimers.save, {
      ...config,
      id: secondId,
      revision: 1,
    }),
    /Premium/
  )
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    enabled: false,
    id: secondId,
    revision: 1,
  })
  await t.mutation(internal.twitchTimers.provisionTestGrant, grant)
  view = await owner.query(api.twitchTimers.list, {})
  assert.equal(view.groups[1]?.enabled, false)
  assert.deepEqual(
    view.groups.map((g) => g.locked),
    [false, false, false]
  )
  await t.run(async (ctx) => {
    const row = await ctx.db.query("twitchTimerGrants").first()
    await ctx.db.patch(row!._id, { expiresAt: 1 })
  })
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).entitlement.limit,
    1
  )
  await owner.mutation(api.twitchTimers.remove, { id: first.id })
  const incremental = await t.query(internal.twitchTimers.runtimePage, {
    since: 0,
  })
  assert.equal(
    incremental.groups.find((g) => g.id === first.id)?.enabled,
    false
  )
  assert.deepEqual(
    incremental.groups.find((g) => g.id === first.id)?.messages,
    []
  )
  assert.equal(
    (await t.query(internal.twitchTimers.runtimePage, {})).groups.length,
    1
  )
})

async function readyRuntime(t: Awaited<ReturnType<typeof setup>>["t"]) {
  await t.run(async (ctx) => {
    for (const group of await ctx.db.query("twitchTimerGroups").collect())
      await ctx.db.patch(group._id, {
        streamId: "100",
        sessionStartedAt: Date.now(),
        sessionLive: true,
      })
  })
  await t.run((ctx) =>
    ctx.db.insert("twitchBotRuntime", {
      key: "chat-v1",
      clientId: "timer-test-client",
      botId: "999",
      updatedAt: Date.now(),
    })
  )
}
async function readyChat(
  t: Awaited<ReturnType<typeof setup>>["t"],
  userId: Awaited<ReturnType<typeof setup>>["userId"]
) {
  return t.run(async (ctx) => {
    const id = await ctx.db.insert("twitchEventSubscriptions", {
      identity: "test",
      key: "chatMessage",
      broadcasterId: "222",
      condition: { broadcaster_user_id: "222", user_id: "999" },
      callback: "https://dev.example/eventsub",
      consumers: [`chat:${userId}`],
      revision: 1,
      status: "ready",
      updatedAt: Date.now(),
    })
    await ctx.db.insert("twitchEventConsumers", {
      consumer: `chat:${userId}`,
      subscription: id,
    })
    return id
  })
}
test("worker authority handles broadcaster changes, missing accounts, revoked presence, leases and stale revisions", async () => {
  const { t, owner, userId } = await setup()
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  const id = await owner.mutation(api.twitchTimers.save, config)
  await readyRuntime(t)
  const claim = async () =>
    t.mutation(internal.twitchTimers.claim, {
      streamId: "100",
      id,
      revision: 1,
      verifiedAt: Date.now(),
      evidence: await t.run(async (ctx) =>
        chatEvidence(await chatAccount(ctx, userId))
      ),
    })
  assert.equal(await claim(), null) // No chat membership.
  const subscriptionId = await readyChat(t, userId)
  assert.equal(await claim(), null) // First interval not elapsed.
  await t.run((ctx) => ctx.db.patch(id, { sessionStartedAt: undefined }))
  assert.equal(await claim(), null) // An older record falls back to creation time.
  await t.run((ctx) => ctx.db.patch(id, { lastAttemptAt: Date.now() - 360000 }))
  for (const patch of [
    { status: "revoked" as const },
    { authorizationRevoked: true },
    { broadcasterId: "333" },
    { key: "follow" },
    { condition: { broadcaster_user_id: "222", user_id: "123" } },
  ]) {
    const before = await t.run((ctx) => ctx.db.get(subscriptionId))
    await t.run((ctx) => ctx.db.patch(subscriptionId, patch))
    assert.equal(await claim(), null)
    await t.run((ctx) => ctx.db.replace(subscriptionId, before!))
  }
  await t.run((ctx) => ctx.db.patch(userId, { status: "disabled" }))
  assert.equal(await claim(), null)
  await t.run((ctx) => ctx.db.patch(userId, { status: "active" }))
  await t.run((ctx) =>
    ctx.db.patch(id, {
      execution: {
        id: "old",
        cursor: 0,
        revision: 1,
        expiresAt: Date.now() + 60000,
      },
    })
  )
  assert.equal(await claim(), null)
  await t.run((ctx) => ctx.db.patch(id, { execution: undefined }))
  const acquired = await claim()
  assert.ok(acquired)
  await owner.mutation(api.twitchTimers.save, {
    ...config,
    id,
    revision: 1,
    messages: ["edited"],
  })
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: acquired.executionId,
    sent: true,
  })
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.cursor, 0)
  const twitch = await t.run((ctx) => ctx.db.query("linkedAccounts").first())
  await t.run((ctx) => ctx.db.patch(twitch!._id, { providerAccountId: "333" }))
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).groups[0]
      ?.broadcasterChanged,
    true
  )
  await assert.rejects(
    owner.mutation(api.twitchTimers.save, { ...config, id, revision: 2 }),
    /previously linked/
  )
  await t.run((ctx) => ctx.db.delete(twitch!._id))
  await assert.rejects(
    owner.mutation(api.twitchTimers.save, config),
    /Connect and sync/
  )
  await t.mutation(internal.twitchTimers.revokeTestGrant, { userId })
  await owner.mutation(api.twitchTimers.remove, { id })
  assert.equal(
    await t.query(internal.twitchTimers.claimContext, {
      id,
      revision: 1,
      streamId: "100",
    }),
    null
  )
  await t.run((ctx) => ctx.db.delete(id))
  assert.equal(
    await t.query(internal.twitchTimers.claimContext, {
      id,
      revision: 1,
      streamId: "100",
    }),
    null
  )
  await t.mutation(internal.twitchTimers.diagnose, {
    id,
    revision: 1,
    state: "ready",
  })
})
test("runtime loading paginates bounded records and does not read deleted history on startup", async () => {
  const { t, userId } = await setup()
  await t.run(async (ctx) => {
    for (let i = 0; i < 101; i++)
      await ctx.db.insert("twitchTimerGroups", {
        ...config,
        userId,
        broadcasterId: "222",
        order: i,
        revision: 1,
        updatedAt: Date.now(),
        cursor: 0,
        deleted: false,
      })
  })
  const first = await t.query(internal.twitchTimers.runtimePage, {})
  assert.equal(first.groups.length, 100)
  assert.ok(first.cursor)
  const last = await t.query(internal.twitchTimers.runtimePage, {
    cursor: first.cursor,
  })
  assert.equal(last.groups.length, 1)
  assert.equal(last.cursor, null)
})

test("downgraded groups cannot claim sends and simultaneous claims have one winner", async () => {
  const { t, owner, userId } = await setup()
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  await t.mutation(internal.twitchTimers.provisionTestGrant, {
    userId,
    broadcasterId: "222",
    expiresAt: Date.now() + 60000,
    reason: "QA",
  })
  const first = await owner.mutation(api.twitchTimers.save, config)
  const second = await owner.mutation(api.twitchTimers.save, config)
  await t.mutation(internal.twitchTimers.revokeTestGrant, { userId })
  await readyRuntime(t)
  await readyChat(t, userId)
  await t.run(async (ctx) => {
    for (const id of [first, second])
      await ctx.db.patch(id, { lastAttemptAt: Date.now() - 360000 })
  })
  const evidence = await t.run(async (ctx) =>
    chatEvidence(await chatAccount(ctx, userId))
  )
  const claims = await Promise.all(
    [first, first, second].map((id) =>
      t.mutation(internal.twitchTimers.claim, {
        streamId: "100",
        id,
        revision: 1,
        evidence,
        verifiedAt: Date.now(),
      })
    )
  )
  assert.equal(claims.filter(Boolean).length, 1)
  assert.equal(claims[2], null)
})
test("authenticated worker actions verify current Clerk/Twitch evidence and reject unauthorized callers", async (testContext) => {
  const { t, owner, userId } = await setup()
  const secret = "timer-test-worker"
  const id = await owner.mutation(api.twitchTimers.save, config)
  await assert.rejects(
    t.action(api.twitchTimerActions.page, { secret: "wrong" }),
    /Unauthorized/
  )
  assert.equal(
    (await t.action(api.twitchTimerActions.page, { secret })).groups.length,
    1
  )
  assert.equal(
    await t.action(api.twitchTimerActions.claim, {
      streamId: "100",
      secret,
      id,
      revision: 1,
    }),
    null
  )
  let currentBroadcaster = "222",
    providerDown = false
  testContext.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (input: string | URL | Request) => {
    if (providerDown) throw new Error("provider unavailable")
    const url = String(input)
    return Response.json(
      url.includes("oauth_access_tokens")
        ? [{ token: "test-only-token" }]
        : url.includes("oauth2/validate")
          ? {
              user_id: currentBroadcaster,
              login: "example",
              client_id: "timer-test-client",
              expires_in: 1000,
              scopes: ["channel:bot"],
            }
          : {
              id: "owner",
              email_addresses: [],
              external_accounts: [
                { provider: "oauth_discord", provider_user_id: "111" },
                {
                  provider: "oauth_twitch",
                  provider_user_id: currentBroadcaster,
                },
              ],
            }
    )
  }
  providerDown = true
  assert.equal(
    await t.action(api.twitchTimerActions.claim, {
      streamId: "100",
      secret,
      id,
      revision: 1,
    }),
    null
  )
  providerDown = false
  currentBroadcaster = "333"
  assert.equal(
    await t.action(api.twitchTimerActions.claim, {
      streamId: "100",
      secret,
      id,
      revision: 1,
    }),
    null
  )
  currentBroadcaster = "222"
  await readyRuntime(t)
  await readyChat(t, userId)
  await t.run((ctx) => ctx.db.patch(id, { lastAttemptAt: Date.now() - 360000 }))
  const claimed = await t.action(api.twitchTimerActions.claim, {
    streamId: "100",
    secret,
    id,
    revision: 1,
  })
  assert.ok(claimed)
  await t.action(api.twitchTimerActions.settle, {
    secret,
    id,
    executionId: claimed.executionId,
    sent: true,
  })
  await t.action(api.twitchTimerActions.diagnose, {
    secret,
    id,
    revision: 1,
    state: "waitingForActivity",
  })
  await owner.mutation(api.twitchTimers.remove, { id })
  assert.equal(
    await t.action(api.twitchTimerActions.claim, {
      streamId: "100",
      secret,
      id,
      revision: 1,
    }),
    null
  )
})

test("claims fail closed, fence conflicts, keep cooldowns and advance only confirmed rotation", async () => {
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  const { t, owner, userId } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  const evidence = await t.run(async (ctx) =>
    chatEvidence(await chatAccount(ctx, userId))
  )
  const claim = () =>
    t.mutation(internal.twitchTimers.claim, {
      streamId: "100",
      id,
      revision: 1,
      evidence,
      verifiedAt: Date.now(),
    })
  assert.equal(await claim(), null)
  await t.mutation(internal.twitchTimers.diagnose, {
    id,
    revision: 1,
    state: "waitingForActivity",
  })
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).groups[0]?.diagnostic,
    "waitingForActivity"
  )
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: "obsolete",
    sent: true,
  })
  await t.run((ctx) => ctx.db.patch(id, { enabled: false }))
  assert.equal(await claim(), null)
  await t.run((ctx) => ctx.db.patch(id, { enabled: true }))
  assert.equal(
    await t.mutation(internal.twitchTimers.claim, {
      streamId: "100",
      id,
      revision: 2,
      evidence,
      verifiedAt: Date.now(),
    }),
    null
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.claim, {
      streamId: "100",
      id,
      revision: 1,
      evidence,
      verifiedAt: 1,
    }),
    null
  )
  // An interrupted execution is not replayed and remains uncertain in the projection.
  await t.run((ctx) =>
    ctx.db.patch(id, {
      execution: {
        id: "execution",
        revision: 1,
        cursor: 0,
        expiresAt: Date.now() + 60000,
      },
      lastAttemptAt: Date.now(),
    })
  )
  assert.equal(
    (await owner.query(api.twitchTimers.list, {})).groups[0]?.diagnostic,
    "uncertain"
  )
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: "wrong",
    sent: true,
  })
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: "execution",
    sent: false,
  })
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.cursor, 0)
  await t.run((ctx) =>
    ctx.db.patch(id, {
      execution: {
        id: "success",
        revision: 1,
        cursor: 0,
        expiresAt: Date.now() + 60000,
      },
    })
  )
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: "success",
    sent: true,
  })
  const group = await t.run((ctx) => ctx.db.get(id))
  assert.equal(group?.cursor, 1)
  assert.ok(group?.lastSentAt)
  await t.run(async (ctx) => {
    await ctx.db.insert("twitchBotRuntime", {
      key: "chat-v1",
      clientId: "timer-test-client",
      botId: "999",
      updatedAt: Date.now(),
    })
    const subscription = await ctx.db.insert("twitchEventSubscriptions", {
      identity: "test",
      key: "chatMessage",
      broadcasterId: "222",
      condition: { broadcaster_user_id: "222", user_id: "999" },
      callback: "https://dev.example/eventsub",
      consumers: [`chat:${userId}`],
      revision: 1,
      status: "ready",
      updatedAt: Date.now(),
    })
    await ctx.db.insert("twitchEventConsumers", {
      consumer: `chat:${userId}`,
      subscription,
    })
    await ctx.db.patch(id, {
      streamId: "100",
      sessionLive: true,
      sessionStartedAt: Date.now() - 360000,
      lastAttemptAt: Date.now() - 300001,
      lastSentAt: Date.now() - 300001,
    })
  })
  const acquired = await claim()
  assert.ok(acquired)
  assert.equal(acquired.message, "second")
  assert.equal(await claim(), null)
  await t.mutation(internal.twitchTimers.settle, {
    id,
    executionId: acquired.executionId,
    sent: true,
  })
  assert.equal((await t.run((ctx) => ctx.db.get(id)))?.cursor, 0)
  assert.equal(await claim(), null)
})

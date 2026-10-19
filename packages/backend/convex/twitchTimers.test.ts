import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import { api, internal } from "./_generated/api"
import schema from "./schema"
process.env.TWITCH_CHAT_PRESENCE_ENABLED = "true"
process.env.TWITCH_CLIENT_ID = "timer-test-client"
process.env.TWITCH_BOT_USER_ID = "999"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./twitchTimers.ts": () => import("./twitchTimers"),
}
const config = {
  name: "Links",
  enabled: true,
  intervalMinutes: 5,
  minimumMessages: 1,
  messages: ["first", "second"],
}
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

test("claims fail closed, fence conflicts, keep cooldowns and advance only confirmed rotation", async () => {
  const { chatAccount, chatEvidence } = await import("./twitchChat")
  const { t, owner, userId } = await setup()
  const id = await owner.mutation(api.twitchTimers.save, config)
  const evidence = await t.run(async (ctx) =>
    chatEvidence(await chatAccount(ctx, userId))
  )
  const claim = () =>
    t.mutation(internal.twitchTimers.claim, {
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
      id,
      revision: 2,
      evidence,
      verifiedAt: Date.now(),
    }),
    null
  )
  assert.equal(
    await t.mutation(internal.twitchTimers.claim, {
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
    await ctx.db.patch(id, { lastAttemptAt: Date.now() - 300001 })
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

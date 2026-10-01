import assert from "node:assert/strict"
import { test, afterEach, beforeEach, mock } from "node:test"
import { convexTest } from "convex-test"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import { randomUUID } from "node:crypto"
import type { FunctionArgs } from "convex/server"
import { boundedMap } from "./lib/boundedMap"

process.env.CLERK_SECRET_KEY = "test-clerk-secret"
process.env.DISCORD_BOT_TOKEN = "test-discord-token"
process.env.DISCORD_BOT_CONVEX_SECRET = "test-bot-secret"
process.env.TWITCH_WORKER_SECRET = "test-runtime-secret"
process.env.TWITCH_CLIENT_ID = "test-client"
process.env.TWITCH_CLIENT_SECRET = "test-client-secret"
process.env.TWITCH_BOT_USER_ID = "111"
process.env.TWITCH_EVENTSUB_CALLBACK_URL = "https://test.example/eventsub"
process.env.TWITCH_EVENTSUB_SECRET =
  "test-eventsub-secret-012345678901234567890"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./liveNotifications.ts": () => import("./liveNotifications"),
  "./liveNotificationActions.ts": () => import("./liveNotificationActions"),
  "./http.ts": () => import("./http"),
  "./twitchEventSub.ts": () => import("./twitchEventSub"),
  "./twitchEventSubActions.ts": () => import("./twitchEventSubActions"),
  "./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId.ts": () =>
    import("./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId"),
}
const guildDiscordId = "123456789012345678"
const ownerDiscordId = "234567890123456789"
const managerDiscordId = "345678901234567890"
const channelId = "456789012345678901"
const roleId = "567890123456789012"
const secret = "test-bot-secret"
const originalFetch = globalThis.fetch
async function receiveEvent(
  t: ReturnType<typeof convexTest>,
  args: FunctionArgs<typeof internal.liveNotifications.receive>
) {
  const id = await t.mutation(internal.liveNotifications.receive, args)
  assert.ok(id)
  return id
}
async function claimJobs(
  t: ReturnType<typeof convexTest>,
  args: { secret: string; discordGuildIds: string[] }
) {
  const deliveries = await t.run((ctx) =>
    ctx.db.query("twitchLiveDeliveries").collect()
  )
  const jobs = []
  for (const delivery of deliveries) {
    if (!args.discordGuildIds.includes(delivery.discordGuildId ?? "")) continue
    const job = await t.mutation(internal.liveNotifications.claim, {
      deliveryId: delivery._id,
      claim: randomUUID(),
    })
    if (job) jobs.push(job)
  }
  return jobs
}
beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] })
})
afterEach(() => {
  globalThis.fetch = originalFetch
  mock.timers.reset()
})

type FixtureOptions = {
  ownerLinked?: boolean
  ownerDisabled?: boolean
  managerIsOwner?: boolean
  botLeft?: boolean
}
async function fixture(options: FixtureOptions = {}) {
  const t = convexTest({ schema, modules })
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      clerkUserId: "owner",
      email: "owner@example.com",
      role: "user",
      status: options.ownerDisabled ? "disabled" : "active",
      createdAt: 1,
      updatedAt: 1,
    })
    const managerId = await ctx.db.insert("users", {
      clerkUserId: "manager",
      email: "manager@example.com",
      role: "user",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    })
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId: guildDiscordId,
      ownerDiscordId,
      name: "Test server",
      createdAt: 1,
      updatedAt: 1,
      ...(options.botLeft ? { botLeftAt: 2 } : {}),
    })
    const ownerDiscordAccountId = await ctx.db.insert("linkedAccounts", {
      userId: ownerId,
      provider: "discord",
      providerAccountId: ownerDiscordId,
      scopes: [],
      createdAt: 1,
      updatedAt: 1,
    })
    const twitchAccountId =
      options.ownerLinked !== false
        ? await ctx.db.insert("linkedAccounts", {
            userId: ownerId,
            provider: "twitch",
            providerAccountId: "222",
            username: "owner",
            displayName: "Owner",
            avatarUrl: "https://example.com/avatar.png",
            scopes: ["channel:bot"],
            createdAt: 1,
            updatedAt: 1,
          })
        : null
    await ctx.db.insert("linkedAccounts", {
      userId: managerId,
      provider: "discord",
      providerAccountId: managerDiscordId,
      scopes: ["guilds"],
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert("linkedAccounts", {
      userId: managerId,
      provider: "twitch",
      providerAccountId: "333",
      username: "manager",
      scopes: ["channel:bot"],
      createdAt: 1,
      updatedAt: 1,
    })
    const membershipId = await ctx.db.insert("discordGuildMemberships", {
      guildId,
      userId: options.managerIsOwner ? ownerId : managerId,
      discordUserId: options.managerIsOwner ? ownerDiscordId : managerDiscordId,
      canManage: true,
      managementVerifiedAt: Date.now(),
      createdAt: 1,
      updatedAt: 1,
    })
    const unrelatedConfigId = await ctx.db.insert("guildConfigs", {
      guildId,
      aiEnabled: true,
      welcomeEnabled: true,
      moderationEnabled: true,
      loggingEnabled: true,
      welcomeSubtext: "Keep me",
      createdAt: 1,
      updatedAt: 1,
    })
    return {
      guildId,
      ownerId,
      managerId,
      twitchAccountId,
      ownerDiscordAccountId,
      membershipId,
      unrelatedConfigId,
    }
  })
  let linkedId: string | undefined = "222"
  let providerUnavailable = false
  let tokenUserId = "222"
  let permissions = "32"
  let channelType = 0
  let rolesAvailable = true
  let scopes = ["channel:bot"]
  const externalSubscriptions: {
    id: string
    status: string
    type: string
    version: string
    condition: Record<string, string>
    transport: { method: string; callback: string }
  }[] = []
  const subscriptionRequests: { method: string; body?: unknown }[] = []
  let subscriptionUnavailable = false
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (providerUnavailable && url.hostname === "api.clerk.com")
      return Response.json({}, { status: 503 })
    if (url.pathname.includes("oauth_access_tokens"))
      return Response.json([
        {
          token: url.pathname.endsWith("oauth_twitch")
            ? "private-owner-twitch-token"
            : "private-manager-discord-token",
        },
      ])
    if (url.hostname === "api.clerk.com")
      return Response.json({
        id: "owner",
        external_accounts: [
          { provider: "oauth_discord", provider_user_id: ownerDiscordId },
          ...(linkedId
            ? [{ provider: "oauth_twitch", provider_user_id: linkedId }]
            : []),
        ],
      })
    if (url.pathname.endsWith("token"))
      return Response.json({
        access_token: "app-token",
        expires_in: 3600,
        token_type: "bearer",
      })
    if (url.pathname.endsWith("subscriptions")) {
      if (subscriptionUnavailable) return Response.json({}, { status: 503 })
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body))
        subscriptionRequests.push({ method: "POST", body })
        const row = {
          ...body,
          transport: {
            method: body.transport.method,
            callback: body.transport.callback,
          },
          id: `subscription-${subscriptionRequests.length}`,
          status: "enabled",
        }
        externalSubscriptions.push(row)
        return Response.json({ data: [row] }, { status: 202 })
      }
      if (init?.method === "DELETE") {
        subscriptionRequests.push({ method: "DELETE" })
        const index = externalSubscriptions.findIndex(
          (row) => row.id === url.searchParams.get("id")
        )
        if (index >= 0) externalSubscriptions.splice(index, 1)
        return new Response(null, { status: 204 })
      }
      return Response.json({ data: externalSubscriptions, pagination: {} })
    }
    if (url.pathname.endsWith("validate"))
      return Response.json({
        user_id: tokenUserId,
        login: "verified_owner",
        client_id: "test-client",
        expires_in: 100,
        scopes,
      })
    if (url.pathname.endsWith("streams"))
      return Response.json({
        data: [
          { id: "9001", title: "Playing @everyone", game_name: "Test game" },
        ],
      })
    if (url.pathname.endsWith("/users/@me/guilds"))
      return Response.json([
        { id: guildDiscordId, name: "Test server", permissions },
      ])
    if (url.pathname.endsWith("/channels"))
      return Response.json([{ id: channelId, name: "live", type: channelType }])
    if (url.pathname.endsWith("/roles"))
      return rolesAvailable
        ? Response.json([
            {
              id: roleId,
              name: "Live viewers",
              permissions: "0",
              position: 1,
              managed: false,
            },
            {
              id: guildDiscordId,
              name: "@everyone",
              permissions: "0",
              position: 0,
              managed: false,
            },
          ])
        : Response.json({}, { status: 503 })
    return Response.json({
      id: guildDiscordId,
      name: "Test server",
      owner_id: ownerDiscordId,
    })
  }
  const manager = t.withIdentity({
    subject: options.managerIsOwner ? "owner" : "manager",
  })
  return {
    t,
    manager,
    ids,
    subscriptionRequests,
    externalSubscriptions,
    setSubscriptionUnavailable: (value: boolean) => {
      subscriptionUnavailable = value
    },
    setLinkedId: (value: string | undefined) => {
      linkedId = value
    },
    setUnavailable: (value = true) => {
      providerUnavailable = value
    },
    setTokenId: (id: string) => {
      tokenUserId = id
    },
    setPermissions: (value: string) => {
      permissions = value
    },
    setChannelType: (value: number) => {
      channelType = value
    },
    setRolesUnavailable: () => {
      rolesAvailable = false
    },
    setScopes: (value: string[]) => {
      scopes = value
    },
  }
}

const config = {
  discordGuildId: guildDiscordId,
  liveNotificationsEnabled: true,
  liveNotificationChannelId: channelId,
  liveNotificationMentionMode: "none" as const,
}
const event = {
  broadcasterId: "222",
  streamId: "9001",
  messageId: "event-1",
  login: "verified_owner",
  displayName: "Owner",
  startedAt: new Date().toISOString(),
}

test("shared external subscriptions are created immediately, retained for other consumers and deleted for the last consumer", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  let rows = await f.t.run((ctx) =>
    ctx.db.query("twitchEventSubscriptions").collect()
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.status, "ready")
  assert.ok(rows[0]?.subscriptionId)
  assert.equal(
    f.subscriptionRequests.filter((request) => request.method === "POST")
      .length,
    1
  )
  const subscription = rows[0]!._id
  // Changing ordinary configuration cannot touch the external subscription.
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    liveNotificationMentionMode: "everyone",
  })
  assert.equal(f.subscriptionRequests.length, 1)
  const secondId = "987654321098765432"
  const secondGuild = await f.t.run(async (ctx) => {
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId: secondId,
      ownerDiscordId,
      name: "Second guild",
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert("discordGuildMemberships", {
      guildId,
      userId: f.ids.managerId,
      discordUserId: managerDiscordId,
      canManage: true,
      managementVerifiedAt: Date.now(),
      createdAt: 1,
      updatedAt: 1,
    })
    return guildId
  })
  await f.manager.mutation(internal.liveNotifications.save, {
    ...config,
    discordGuildId: secondId,
    expectedBroadcasterId: "222",
    expectedOwnerDiscordId: ownerDiscordId,
  })
  await f.t.action(internal.twitchEventSubActions.reconcile, { subscription })
  rows = await f.t.run((ctx) =>
    ctx.db.query("twitchEventSubscriptions").collect()
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.consumers.length, 2)
  assert.equal(f.subscriptionRequests.length, 1)
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    liveNotificationsEnabled: false,
  })
  assert.equal(f.externalSubscriptions.length, 1)
  assert.deepEqual(
    (await f.t.run((ctx) => ctx.db.get(subscription)))?.consumers,
    [`guild:${secondGuild}`]
  )
  await f.manager.mutation(internal.liveNotifications.save, {
    ...config,
    discordGuildId: secondId,
    liveNotificationsEnabled: false,
  })
  await f.t.action(internal.twitchEventSubActions.reconcile, { subscription })
  assert.equal(f.externalSubscriptions.length, 0)
  assert.deepEqual(
    f.subscriptionRequests.map((request) => request.method),
    ["POST", "DELETE"]
  )
  const stopped = await f.t.run((ctx) => ctx.db.get(subscription))
  assert.equal(stopped?.status, "disabled")
  assert.equal(stopped?.subscriptionId, undefined)
})

test("announcement enable saves dirty template atomically, template edits never alter EventSub, disable preserves override", async () => {
  const f = await fixture()
  const owner = f.t.withIdentity({ subject: "owner" })
  await assert.rejects(
    owner.action(api.twitchEventSubActions.updateAnnouncement, {
      key: "follow",
      enabled: true,
      template: "YO {user}",
    }),
    /Reconnect required/
  )
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.query("twitchAnnouncementConfigs").collect()
      )
    ).length,
    0
  )
  f.setScopes(["channel:bot", "moderator:read:followers"])
  await owner.action(api.twitchEventSubActions.updateAnnouncement, {
    key: "follow",
    enabled: true,
    template: "YO {user}",
  })
  const saved = await owner.query(api.twitchEventSub.settings, {})
  assert.deepEqual(saved.configs, [
    { key: "follow", enabled: true, template: "YO {user}" },
  ])
  assert.equal(saved.subscriptions[0]?.status, "ready")
  const active = (await f.t.run((ctx) =>
    ctx.db.query("twitchEventSubscriptions").unique()
  ))!
  await f.t.run((ctx) =>
    ctx.db.insert("twitchEventSubscriptions", {
      identity: "historical-callback",
      key: "follow",
      broadcasterId: "222",
      callback: "https://old.example/eventsub",
      condition: active.condition,
      consumers: [],
      revision: 1,
      status: "disabled",
      updatedAt: 0,
    })
  )
  assert.equal(
    (await owner.query(api.twitchEventSub.settings, {})).subscriptions[0]
      ?.status,
    "ready"
  )
  const receipt = {
    secret: "test-runtime-secret",
    messageId: "follow-event",
    key: "follow",
    broadcasterId: "222",
  }
  assert.deepEqual(
    await f.t.action(api.twitchEventSubActions.reserveEvent, receipt),
    { duplicate: false, template: "YO {user}" }
  )
  assert.deepEqual(
    await f.t.action(api.twitchEventSubActions.reserveEvent, receipt),
    { duplicate: true }
  )
  await owner.action(api.twitchEventSubActions.updateAnnouncement, {
    key: "follow",
    enabled: true,
    template: "Welcome {user}!",
  })
  assert.equal(f.subscriptionRequests.length, 1)
  // A restart sees the same persistent receipt, even after a template change.
  assert.deepEqual(
    await f.t.action(api.twitchEventSubActions.reserveEvent, receipt),
    { duplicate: true }
  )
  assert.deepEqual(
    await f.t.action(api.twitchEventSubActions.reserveEvent, {
      ...receipt,
      messageId: "next-event",
    }),
    { duplicate: false, template: "Welcome {user}!" }
  )
  f.setUnavailable()
  await owner.action(api.twitchEventSubActions.updateAnnouncement, {
    key: "follow",
    enabled: false,
    template: "Welcome {user}!",
  })
  assert.deepEqual(
    (await owner.query(api.twitchEventSub.settings, {})).configs,
    [{ key: "follow", enabled: false, template: "Welcome {user}!" }]
  )
  assert.equal(f.externalSubscriptions.length, 0)
  await owner.action(api.twitchEventSubActions.updateAnnouncement, {
    key: "follow",
    enabled: false,
  })
  assert.equal(
    (await owner.query(api.twitchEventSub.settings, {})).configs[0]?.template,
    "Welcome {user}!"
  )
  await owner.action(api.twitchEventSubActions.updateAnnouncement, {
    key: "follow",
    enabled: false,
    template: null,
  })
  assert.equal(
    (await owner.query(api.twitchEventSub.settings, {})).configs[0]?.template,
    undefined
  )
  await assert.rejects(
    owner.action(api.twitchEventSubActions.updateAnnouncement, {
      key: "follow",
      enabled: true,
      template: "{bits}",
    }),
    /Unsupported/
  )
})

test("subscription errors and revocations surface reactively; retries remain in Convex", async () => {
  const f = await fixture()
  f.setSubscriptionUnavailable(true)
  await f.manager.action(api.liveNotificationActions.update, config)
  assert.equal(
    (
      await f.manager.query(api.liveNotifications.projection, {
        discordGuildId: guildDiscordId,
      })
    ).subscriptionStatus,
    "providerUnavailable"
  )
  f.setSubscriptionUnavailable(false)
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    retry: true,
  })
  const row = (await f.t.run((ctx) =>
    ctx.db.query("twitchEventSubscriptions").unique()
  ))!
  assert.ok(row.subscriptionId)
  await f.t.action(api.twitchEventSubActions.webhookState, {
    secret: "test-runtime-secret",
    subscriptionId: row.subscriptionId,
    revoked: true,
  })
  assert.equal(
    (
      await f.manager.query(api.liveNotifications.projection, {
        discordGuildId: guildDiscordId,
      })
    ).subscriptionStatus,
    "revoked"
  )
  assert.equal(
    f.subscriptionRequests.filter((request) => request.method === "POST")
      .length,
    1
  )
  await assert.rejects(
    f.t.action(api.twitchEventSubActions.reserveEvent, {
      secret: "bad",
      key: "follow",
      broadcasterId: "222",
      messageId: "bad",
    }),
    /Unauthorized/
  )
  await assert.rejects(
    f.t.action(api.liveNotificationActions.receiveOnline, {
      secret: "bad",
      messageId: "bad",
      event: {},
    }),
    /Unauthorized/
  )
  await f.t.action(api.liveNotificationActions.receiveOnline, {
    secret: "test-runtime-secret",
    messageId: "stream-online",
    event: {
      id: "9001",
      type: "live",
      broadcaster_user_id: "222",
      broadcaster_user_login: "owner",
      broadcaster_user_name: "Owner",
      started_at: new Date().toISOString(),
    },
  })
  await f.t.action(api.liveNotificationActions.receiveOnline, {
    secret: "test-runtime-secret",
    messageId: "stream-online",
    event: {
      id: "9001",
      type: "live",
      broadcaster_user_id: "222",
      broadcaster_user_login: "owner",
      broadcaster_user_name: "Owner",
      started_at: new Date().toISOString(),
    },
  })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveEvents").collect())).length,
    1
  )
})

test("failed last-consumer deletion stays visible and an authorized disabled retry completes cleanup", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  f.setSubscriptionUnavailable(true)
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    liveNotificationsEnabled: false,
  })
  const failed = await f.manager.query(api.liveNotifications.projection, {
    discordGuildId: guildDiscordId,
  })
  assert.equal(failed.config.liveNotificationsEnabled, false)
  assert.equal(failed.subscriptionStatus, "providerUnavailable")
  assert.equal(f.externalSubscriptions.length, 1)
  f.setSubscriptionUnavailable(false)
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    liveNotificationsEnabled: false,
    retry: true,
  })
  assert.equal(f.externalSubscriptions.length, 0)
  assert.equal(
    (
      await f.manager.query(api.liveNotifications.projection, {
        discordGuildId: guildDiscordId,
      })
    ).subscriptionStatus,
    "disabled"
  )
})

test("early challenge readiness survives create settlement and concurrent desired changes release the subscription", async () => {
  const f = await fixture()
  await f.manager.mutation(internal.liveNotifications.save, {
    ...config,
    expectedBroadcasterId: "222",
    expectedOwnerDiscordId: ownerDiscordId,
  })
  const row = (await f.t.run((ctx) =>
    ctx.db.query("twitchEventSubscriptions").unique()
  ))!
  const acquired = await f.t.mutation(internal.twitchEventSub.acquire, {
    subscription: row._id,
    lease: "first",
  })
  assert.ok(acquired)
  assert.equal(
    await f.t.mutation(internal.twitchEventSub.acquire, {
      subscription: row._id,
      lease: "second",
    }),
    null
  )
  await f.t.action(api.twitchEventSubActions.webhookState, {
    secret: "test-runtime-secret",
    subscriptionId: "early-challenge",
    key: "streamOnline",
    broadcasterId: "222",
    revoked: false,
  })
  await f.t.mutation(internal.twitchEventSub.settle, {
    subscription: row._id,
    lease: "wrong",
    revision: row.revision,
    status: "failed",
  })
  assert.equal((await f.t.run((ctx) => ctx.db.get(row._id)))?.lease, "first")
  await f.t.mutation(internal.twitchEventSub.settle, {
    subscription: row._id,
    lease: "first",
    revision: row.revision,
    subscriptionId: "early-challenge",
    status: "connecting",
  })
  assert.equal((await f.t.run((ctx) => ctx.db.get(row._id)))?.status, "ready")
  await f.t.mutation(internal.twitchEventSub.acquire, {
    subscription: row._id,
    lease: "changing",
  })
  await f.manager.mutation(internal.liveNotifications.save, {
    ...config,
    liveNotificationsEnabled: false,
  })
  await f.t.mutation(internal.twitchEventSub.settle, {
    subscription: row._id,
    lease: "changing",
    revision: row.revision,
    subscriptionId: "early-challenge",
    status: "ready",
  })
  await f.t.action(internal.twitchEventSubActions.reconcile, {
    subscription: row._id,
  })
  const stopped = await f.t.run((ctx) => ctx.db.get(row._id))
  assert.equal(stopped?.status, "disabled")
  assert.equal(stopped?.subscriptionId, undefined)
  assert.equal(stopped?.consumers.length, 0)
})

test("explicit migration restores existing enabled consumers once and supports safe repeated invocation", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  await f.t.run(async (ctx) => {
    for (const row of await ctx.db.query("twitchEventConsumers").collect())
      await ctx.db.delete(row._id)
    for (const row of await ctx.db.query("twitchEventSubscriptions").collect())
      await ctx.db.delete(row._id)
  })
  assert.deepEqual(
    await f.t.action(internal.liveNotificationActions.migrateConsumers, {}),
    { migrated: 1, skipped: 0, cursor: null }
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchEventSubscriptions").collect()))
      .length,
    1
  )
  assert.equal(f.subscriptionRequests.length, 1)
  await f.t.action(internal.liveNotificationActions.migrateConsumers, {})
  assert.equal(f.subscriptionRequests.length, 1)
})
test("direct Discord delivery reserves before one REST send, persists success and never replays ambiguous sends", async () => {
  for (const outcome of [
    "sent",
    "lostResponse",
    "rateLimited",
    "invalidMessage",
    "preflightUnavailable",
    "noPermission",
  ] as const) {
    const f = await fixture()
    await f.manager.action(api.liveNotificationActions.update, config)
    const id = await receiveEvent(f.t, event)
    await f.t.action(internal.liveNotificationActions.processEvent, {
      eventId: id,
    })
    const job = (await f.t.run((ctx) =>
      ctx.db.query("twitchLiveDeliveries").unique()
    ))!
    const base = globalThis.fetch
    let sends = 0
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.hostname === "discord.com") {
        if (url.pathname.endsWith(`/guilds/${guildDiscordId}`)) {
          if (outcome === "preflightUnavailable")
            return Response.json({}, { status: 503 })
          return Response.json({
            owner_id: ownerDiscordId,
            roles: [
              {
                id: guildDiscordId,
                permissions: outcome === "noPermission" ? "0" : "134144",
                mentionable: false,
                managed: false,
              },
            ],
          })
        }
        if (url.pathname.endsWith(`/channels/${channelId}`))
          return Response.json({
            guild_id: guildDiscordId,
            type: 0,
            permission_overwrites: [],
          })
        if (url.pathname.endsWith("/users/@me"))
          return Response.json({ id: "999999999999999999" })
        if (url.pathname.includes("/members/"))
          return Response.json({ roles: [] })
        if (url.pathname.endsWith("/messages")) {
          sends++
          assert.equal(
            (await f.t.run((ctx) => ctx.db.get(job._id)))?.state,
            "sending"
          )
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            "Bot test-discord-token"
          )
          const payload = JSON.parse(String(init?.body))
          assert.equal(payload.flags, 32768)
          assert.equal("embeds" in payload, false)
          if (outcome === "lostResponse") throw new Error("ambiguous")
          if (outcome === "rateLimited")
            return Response.json({ retry_after: 1 }, { status: 429 })
          return Response.json({
            id: outcome === "invalidMessage" ? "bad" : "678901234567890123",
          })
        }
      }
      return base(input, init)
    }
    await f.t.action(internal.liveNotificationActions.deliver, {
      deliveryId: job._id,
    })
    const stored = await f.t.run((ctx) => ctx.db.get(job._id))
    assert.equal(
      stored?.state,
      outcome === "sent"
        ? "sent"
        : outcome === "preflightUnavailable"
          ? "claimed"
          : outcome === "noPermission"
            ? "failed"
            : "uncertain"
    )
    assert.equal(
      sends,
      outcome === "preflightUnavailable" || outcome === "noPermission" ? 0 : 1
    )
    await f.t.action(internal.liveNotificationActions.deliver, {
      deliveryId: job._id,
    })
    assert.ok(sends <= 1)
  }
})
test("source is fixed to guild owner through trusted indexes and live Clerk/provider evidence", async () => {
  const f = await fixture()
  const view = await f.manager.action(api.liveNotificationActions.get, {
    discordGuildId: guildDiscordId,
  })
  assert.equal(view.isOwner, false)
  assert.equal(view.source.status, "ready")
  if (view.source.status === "ready") {
    assert.equal(view.source.broadcasterId, "222")
    assert.equal(view.source.login, "verified_owner")
  }
  assert.equal(
    JSON.stringify(view).includes("private-owner-twitch-token"),
    false
  )
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.update, {
      ...config,
      broadcasterId: "333",
    } as never),
    /extra field|unexpected|validator/i
  )
  f.setLinkedId("333")
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).source.status,
    "stale"
  )
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.update, config),
    /owner/
  )
  f.setLinkedId("222")
  f.setTokenId("333")
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).source.status,
    "stale"
  )
})

test("missing owner link, disabled user, missing permission and provider outages never borrow manager Twitch authority", async () => {
  for (const options of [
    { ownerLinked: false },
    { ownerDisabled: true },
    { managerIsOwner: true },
  ]) {
    const f = await fixture(options)
    const view = await f.manager.action(api.liveNotificationActions.get, {
      discordGuildId: guildDiscordId,
    })
    assert.equal(
      view.source.status,
      options.ownerLinked === false
        ? "needsLink"
        : options.ownerDisabled
          ? "unavailable"
          : "ready"
    )
    assert.equal(view.isOwner, !!options.managerIsOwner)
    if (!options.managerIsOwner)
      await assert.rejects(
        f.manager.action(api.liveNotificationActions.update, config),
        /owner/
      )
  }
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  f.setScopes([])
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).source.status,
    "missingPermission"
  )
  f.setUnavailable()
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).source.status,
    "unavailable"
  )
})

test("save validates real Discord destination and role, clears custom role and preserves unrelated config with audit", async () => {
  const f = await fixture()
  const original = await f.t.run((ctx) => ctx.db.get(f.ids.unrelatedConfigId))
  for (const mode of ["none", "everyone", "role"] as const)
    await f.manager.action(api.liveNotificationActions.update, {
      ...config,
      liveNotificationMentionMode: mode,
      ...(mode === "role" ? { liveNotificationRoleId: roleId } : {}),
    })
  let stored = await f.t.run((ctx) =>
    ctx.db.query("guildLiveNotificationConfigs").unique()
  )
  assert.equal(stored?.liveNotificationRoleId, roleId)
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    liveNotificationsEnabled: false,
    liveNotificationMentionMode: "everyone",
    liveNotificationRoleId: roleId,
  })
  stored = await f.t.run((ctx) =>
    ctx.db.query("guildLiveNotificationConfigs").unique()
  )
  assert.equal(stored?.liveNotificationRoleId, undefined)
  assert.equal(stored?.liveNotificationsEnabled, false)
  assert.deepEqual(
    await f.t.run((ctx) => ctx.db.get(f.ids.unrelatedConfigId)),
    original
  )
  const audits = await f.t.run((ctx) =>
    ctx.db.query("guildAuditEvents").collect()
  )
  assert.equal(audits.length, 4)
  assert.equal(
    audits[3]?.eventType,
    "dashboard.guild_config.live_notifications_updated"
  )
  const runtime = await f.t.query(
    internal.queries.bot.discord.guildConfigs.runtimeConfigByDiscordId.get,
    { discordGuildId: guildDiscordId }
  )
  assert.equal(runtime.status, "ready")
  if (runtime.status === "ready") {
    assert.equal(runtime.config.liveNotificationsEnabled, false)
    assert.equal(runtime.config.liveNotificationMentionMode, "everyone")
    assert.equal(runtime.config.liveNotificationRoleId, undefined)
  }
  for (const patch of [
    { liveNotificationChannelId: "123" },
    { liveNotificationChannelId: "999999999999999999" },
    { liveNotificationChannelId: undefined },
    { liveNotificationMentionMode: "role", liveNotificationRoleId: "123" },
    {
      liveNotificationMentionMode: "role",
      liveNotificationRoleId: guildDiscordId,
    },
    { liveNotificationMentionMode: "role" },
    {
      liveNotificationMentionMode: "role",
      liveNotificationRoleId: "999999999999999999",
    },
  ])
    await assert.rejects(
      f.manager.action(api.liveNotificationActions.update, {
        ...config,
        ...patch,
      } as never)
    )
  for (const type of [11, 15]) {
    f.setChannelType(type)
    await assert.rejects(
      f.manager.action(api.liveNotificationActions.update, config),
      /text or announcement/
    )
  }
  f.setChannelType(5)
  await f.manager.action(api.liveNotificationActions.update, config)
  f.setRolesUnavailable()
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.update, {
      ...config,
      liveNotificationMentionMode: "role",
      liveNotificationRoleId: roleId,
    }),
    /roles/
  )
})

test("bot-left and revoked/disabled manager authority fail closed on configuration", async () => {
  const left = await fixture({ botLeft: true })
  await assert.rejects(
    left.manager.action(api.liveNotificationActions.update, config),
    /no longer/
  )
  const f = await fixture()
  f.setPermissions("0")
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.update, config),
    /Manage Server/
  )
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.membershipId, { revokedAt: Date.now() })
  )
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.update, config),
    /management/
  )
  await f.t.run((ctx) => ctx.db.patch(f.ids.managerId, { status: "disabled" }))
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.get, {
      discordGuildId: guildDiscordId,
    }),
    /disabled/
  )
})

test("disable preserves deleted saved destinations while rejecting newly submitted arbitrary IDs", async () => {
  const f = await fixture()
  const selected = {
    ...config,
    liveNotificationMentionMode: "role" as const,
    liveNotificationRoleId: roleId,
  }
  await f.manager.action(api.liveNotificationActions.update, selected)
  f.setChannelType(15)
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).discordStatus,
    "needsChannel"
  )
  f.setChannelType(0)
  f.setRolesUnavailable()
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).discordStatus,
    "unavailable"
  )
  await f.manager.action(api.liveNotificationActions.update, {
    ...selected,
    liveNotificationsEnabled: false,
  })
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.query("guildLiveNotificationConfigs").unique()
      )
    )?.liveNotificationsEnabled,
    false
  )
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.update, {
      ...selected,
      liveNotificationsEnabled: false,
      liveNotificationChannelId: "999999999999999999",
    })
  )
  await assert.rejects(
    f.manager.action(api.liveNotificationActions.update, {
      ...selected,
      liveNotificationsEnabled: false,
      liveNotificationRoleId: "999999999999999999",
    })
  )
})

test("EventSub and stream-session dedupe survives duplicate processing, claims, restarts and new sessions", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  const id = await receiveEvent(f.t, event)
  assert.equal(
    await receiveEvent(f.t, {
      ...event,
      messageId: "redelivery",
    }),
    id
  )
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: id,
  })
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: id,
  })
  let deliveries = await f.t.run((ctx) =>
    ctx.db.query("twitchLiveDeliveries").collect()
  )
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0]?.title, "Playing @everyone")
  const jobs = await claimJobs(f.t, {
    secret,
    discordGuildIds: [guildDiscordId],
  })
  const job = jobs[0]
  assert.ok(job)
  assert.equal(jobs.length, 1)
  assert.equal(
    (
      await claimJobs(f.t, {
        secret,
        discordGuildIds: [guildDiscordId],
      })
    ).length,
    0
  )
  const input = {
    deliveryId: job._id,
    claim: job.claim,
    configUpdatedAt: job.config.updatedAt,
  }
  assert.equal(
    await f.t.action(internal.liveNotificationActions.begin, input),
    true
  )
  assert.equal(
    await f.t.action(internal.liveNotificationActions.begin, input),
    false
  )
  await f.t.mutation(internal.liveNotifications.expire, {
    deliveryId: job._id,
    claim: job.claim,
  })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(job._id)))?.state,
    "uncertain"
  )
  assert.equal(
    (
      await claimJobs(f.t, {
        secret,
        discordGuildIds: [guildDiscordId],
      })
    ).length,
    0
  )
  await f.t.mutation(internal.liveNotifications.finish, {
    deliveryId: job._id,
    claim: job.claim,
    messageId: "678901234567890123",
  })
  assert.equal((await f.t.run((ctx) => ctx.db.get(job._id)))?.state, "sent")
  const newId = await receiveEvent(f.t, {
    ...event,
    streamId: "9002",
    messageId: "new-stream",
  })
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: newId,
  })
  deliveries = await f.t.run((ctx) =>
    ctx.db.query("twitchLiveDeliveries").collect()
  )
  assert.equal(deliveries.length, 2)
  assert.equal(deliveries[1]?.title, undefined)
})

test("delivery preflight retries are bounded and disabled or changed authority cancels sending", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  const id = await receiveEvent(f.t, event)
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: id,
  })
  for (let attempt = 0; attempt < 3; attempt++) {
    const job = (
      await claimJobs(f.t, {
        secret,
        discordGuildIds: [guildDiscordId],
      })
    )[0]
    assert.ok(job)
    if (attempt === 0) {
      f.setUnavailable()
      assert.equal(
        await f.t.action(internal.liveNotificationActions.begin, {
          deliveryId: job._id,
          claim: job.claim,
          configUpdatedAt: job.config.updatedAt,
        }),
        false
      )
      f.setUnavailable(false)
    }
    await f.t.mutation(internal.liveNotifications.expire, {
      deliveryId: job._id,
      claim: job.claim,
    })
  }
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveDeliveries").unique()))
      ?.state,
    "failed"
  )
  const second = await receiveEvent(f.t, {
    ...event,
    streamId: "9002",
    messageId: "second-stream",
  })
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: second,
  })
  const job = (
    await claimJobs(f.t, {
      secret,
      discordGuildIds: [guildDiscordId],
    })
  )[0]
  assert.ok(job)
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    liveNotificationsEnabled: false,
  })
  assert.equal(
    await f.t.action(internal.liveNotificationActions.begin, {
      deliveryId: job._id,
      claim: job.claim,
      configUpdatedAt: job.config.updatedAt,
    }),
    false
  )
  await f.t.mutation(internal.liveNotifications.finish, {
    deliveryId: job._id,
    claim: job.claim,
    failure: "destinationUnavailable",
  })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(job._id)))?.failure,
    "destinationUnavailable"
  )
})

test("processing provider outages leaves durable evidence after bounded retry exhaustion", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  const id = await receiveEvent(f.t, event)
  f.setUnavailable()
  for (let attempt = 0; attempt < 3; attempt++)
    await f.t.action(internal.liveNotificationActions.processEvent, {
      eventId: id,
    })
  assert.equal((await f.t.run((ctx) => ctx.db.get(id)))?.state, "failed")
  assert.equal((await f.t.run((ctx) => ctx.db.get(id)))?.attempts, 3)
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveDeliveries").collect()))
      .length,
    0
  )
})

test("delayed deliveries remain eligible while the same stream is live and fail closed on provider outage", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  const id = await receiveEvent(f.t, event)
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: id,
  })
  const old = await f.t.run((ctx) =>
    ctx.db.query("twitchLiveDeliveries").unique()
  )
  assert.ok(old)
  await f.t.run((ctx) =>
    ctx.db.patch(old._id, { createdAt: Date.now() - 16 * 60000 })
  )
  const [job] = await claimJobs(f.t, {
    secret,
    discordGuildIds: [guildDiscordId],
  })
  assert.ok(job)
  const input = {
    deliveryId: job._id,
    claim: job.claim,
    configUpdatedAt: job.config.updatedAt,
  }
  f.setUnavailable()
  assert.equal(
    await f.t.action(internal.liveNotificationActions.begin, input),
    false
  )
  assert.equal((await f.t.run((ctx) => ctx.db.get(job._id)))?.state, "claimed")
})

test("owner candidates fail closed for missing Discord authority, disabled users, malformed and duplicate data", async () => {
  for (const change of [
    "ownerMissing",
    "discordMissing",
    "discordDuplicate",
    "twitchMalformed",
    "twitchDuplicate",
    "disabled",
  ] as const) {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      if (change === "ownerMissing")
        await ctx.db.patch(f.ids.guildId, { ownerDiscordId: undefined })
      if (change === "discordMissing")
        await ctx.db.delete(f.ids.ownerDiscordAccountId)
      if (change === "disabled")
        await ctx.db.patch(f.ids.ownerId, { status: "disabled" })
      if (change === "discordDuplicate" || change === "twitchDuplicate") {
        const row = await ctx.db.get(
          change === "discordDuplicate"
            ? f.ids.ownerDiscordAccountId
            : f.ids.twitchAccountId!
        )
        assert.ok(row)
        const { _id: _id, _creationTime: _creationTime, ...fields } = row
        await ctx.db.insert("linkedAccounts", fields)
      }
      if (change === "twitchMalformed")
        await ctx.db.patch(f.ids.twitchAccountId!, { providerAccountId: "bad" })
    })
    const view = await f.manager.action(api.liveNotificationActions.get, {
      discordGuildId: guildDiscordId,
    })
    assert.notEqual(view.source.status, "ready", change)
    await assert.rejects(
      f.manager.action(api.liveNotificationActions.update, config)
    )
  }
})

test("current Clerk and OAuth evidence selects a replacement Twitch row while preserving historical rows", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  await f.t.run((ctx) =>
    ctx.db.insert("linkedAccounts", {
      userId: f.ids.ownerId,
      provider: "twitch",
      providerAccountId: "444",
      scopes: ["channel:bot"],
      createdAt: 2,
      updatedAt: 2,
    })
  )
  f.setLinkedId("444")
  f.setTokenId("444")
  const view = await f.manager.action(api.liveNotificationActions.get, {
    discordGuildId: guildDiscordId,
  })
  assert.equal(view.source.status, "ready")
  if (view.source.status === "ready")
    assert.equal(view.source.broadcasterId, "444")
  await f.manager.action(api.liveNotificationActions.update, config)
  const old = await f.t.query(internal.liveNotifications.configured, {
    broadcasterId: "222",
  })
  const current = await f.t.query(internal.liveNotifications.configured, {
    broadcasterId: "444",
  })
  assert.equal(old.targets.length, 0)
  assert.equal(current.targets.length, 1)
  f.setLinkedId(undefined)
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).source.status,
    "stale"
  )
  await f.t.run((ctx) =>
    ctx.db.patch(f.ids.guildId, { ownerDiscordId: managerDiscordId })
  )
  assert.notEqual(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).source.status,
    "ready"
  )
})

test("bounded owner verification never exceeds its worker limit and preserves result order", async () => {
  let running = 0
  let peak = 0
  const result = await boundedMap(
    Array.from({ length: 30 }, (_, i) => i),
    8,
    async (value) => {
      peak = Math.max(peak, ++running)
      await Promise.resolve()
      running--
      return value * 2
    }
  )
  assert.equal(peak, 8)
  assert.deepEqual(
    result,
    Array.from({ length: 30 }, (_, i) => i * 2)
  )
  await assert.rejects(boundedMap([1], 0, async (value) => value))
})

test("send reservation rejects linked authority changed while provider verification was in flight", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  const id = await receiveEvent(f.t, event)
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: id,
  })
  const [job] = await claimJobs(f.t, {
    secret,
    discordGuildIds: [guildDiscordId],
  })
  assert.ok(job)
  const fetchProvider = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/validate"))
      await f.t.run((ctx) =>
        ctx.db.patch(f.ids.twitchAccountId!, { updatedAt: 2 })
      )
    return fetchProvider(input, init)
  }
  assert.equal(
    await f.t.action(internal.liveNotificationActions.begin, {
      deliveryId: job._id,
      claim: job.claim,
      configUpdatedAt: job.config.updatedAt,
    }),
    false
  )
  assert.equal((await f.t.run((ctx) => ctx.db.get(job._id)))?.state, "claimed")
})

test("delivery state distinguishes retryable preflight, deterministic failure and ambiguous send", async () => {
  for (const failure of [
    "networkError",
    "roleUnavailable",
    "sendOutcomeUnknown",
  ]) {
    const f = await fixture()
    await f.manager.action(api.liveNotificationActions.update, config)
    const id = await receiveEvent(f.t, event)
    await f.t.action(internal.liveNotificationActions.processEvent, {
      eventId: id,
    })
    const [job] = await claimJobs(f.t, {
      secret,
      discordGuildIds: [guildDiscordId],
    })
    assert.ok(job)
    if (failure === "sendOutcomeUnknown")
      assert.equal(
        await f.t.action(internal.liveNotificationActions.begin, {
          deliveryId: job._id,
          claim: job.claim,
          configUpdatedAt: job.config.updatedAt,
        }),
        true
      )
    await f.t.mutation(internal.liveNotifications.finish, {
      deliveryId: job._id,
      claim: job.claim,
      failure,
    })
    const row = await f.t.run((ctx) => ctx.db.get(job._id))
    assert.equal(
      row?.state,
      failure === "networkError"
        ? "claimed"
        : failure === "roleUnavailable"
          ? "failed"
          : "uncertain"
    )
    if (failure === "networkError") {
      await f.t.mutation(internal.liveNotifications.expire, {
        deliveryId: job._id,
        claim: job.claim,
      })
      assert.equal(
        (await claimJobs(f.t, { secret, discordGuildIds: [guildDiscordId] }))
          .length,
        1
      )
    } else
      assert.equal(
        (await claimJobs(f.t, { secret, discordGuildIds: [guildDiscordId] }))
          .length,
        0
      )
  }
})

test("delayed notifications send only if their original stream session is still live", async () => {
  for (const streamId of ["9001", "9002"]) {
    const f = await fixture()
    await f.manager.action(api.liveNotificationActions.update, config)
    const id = await receiveEvent(f.t, { ...event, streamId })
    await f.t.action(internal.liveNotificationActions.processEvent, {
      eventId: id,
    })
    const row = await f.t.run((ctx) =>
      ctx.db.query("twitchLiveDeliveries").unique()
    )
    assert.ok(row)
    await f.t.run((ctx) =>
      ctx.db.patch(row._id, { createdAt: Date.now() - 16 * 60000 })
    )
    const [job] = await claimJobs(f.t, {
      secret,
      discordGuildIds: [guildDiscordId],
    })
    assert.ok(job)
    assert.equal(
      await f.t.action(internal.liveNotificationActions.begin, {
        deliveryId: job._id,
        claim: job.claim,
        configUpdatedAt: job.config.updatedAt,
      }),
      streamId === "9001"
    )
    if (streamId === "9002")
      assert.equal(
        (await f.t.run((ctx) => ctx.db.get(job._id)))?.failure,
        "streamEnded"
      )
  }
})

test("retention cleanup deletes bounded old dedupe batches and prevents old session resurrection", async (t) => {
  const clock = Date.now()
  t.mock.method(Date, "now", () => clock)
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 105; i++) {
      const eventId = await ctx.db.insert("twitchLiveEvents", {
        ...event,
        streamId: String(1000 + i),
        state: "processed",
        attempts: 1,
        createdAt: Date.now() - 32 * 86400000,
      })
      await ctx.db.insert("twitchLiveDeliveries", {
        ...event,
        guildId: f.ids.guildId,
        eventId,
        state: "sent",
        attempts: 1,
        createdAt: clock - 32 * 86400000,
        updatedAt: clock - 32 * 86400000,
      })
    }
    await ctx.db.insert("twitchLiveEvents", {
      ...event,
      streamId: "recent",
      state: "processed",
      attempts: 1,
      createdAt: clock - 31 * 86400000,
    })
  })
  await f.t.mutation(internal.liveNotifications.cleanup, {})
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveDeliveries").collect()))
      .length,
    5
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveEvents").collect())).length,
    6
  )
  await f.t.mutation(internal.liveNotifications.cleanup, {})
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveDeliveries").collect()))
      .length,
    0
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("guildAuditEvents").collect())).length,
    1
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveEvents").collect())).length,
    1
  )
  assert.equal(
    await f.t.mutation(internal.liveNotifications.receive, {
      ...event,
      startedAt: new Date(Date.now() - 32 * 86400000).toISOString(),
    }),
    null
  )
})

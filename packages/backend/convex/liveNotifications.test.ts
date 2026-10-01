import assert from "node:assert/strict"
import { test, afterEach, beforeEach, mock } from "node:test"
import { convexTest } from "convex-test"
import { api, internal } from "./_generated/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
import schema from "./schema"
import { createHmac } from "node:crypto"
import { boundedMap } from "./lib/boundedMap"

process.env.CLERK_SECRET_KEY = "test-clerk-secret"
process.env.DISCORD_BOT_TOKEN = "test-discord-token"
process.env.DISCORD_BOT_CONVEX_SECRET = "test-bot-secret"
process.env.TWITCH_RUNTIME_CONVEX_SECRET = "test-runtime-secret"
process.env.TWITCH_EVENTSUB_SECRET =
  "test-eventsub-secret-012345678901234567890"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./liveNotifications.ts": () => import("./liveNotifications"),
  "./liveNotificationActions.ts": () => import("./liveNotificationActions"),
  "./http.ts": () => import("./http"),
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
  globalThis.fetch = async (input) => {
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
  await assert.rejects(
    f.t.action(internal.liveNotificationActions.runtimeSources, {}),
    /unavailable/
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
    secret,
    deliveryId: job._id,
    claim: job.claim,
    configUpdatedAt: job.config.updatedAt,
  }
  assert.equal(await f.t.action(api.liveNotificationActions.begin, input), true)
  assert.equal(
    await f.t.action(api.liveNotificationActions.begin, input),
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
  await f.t.action(api.liveNotificationActions.finish, {
    secret,
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
  await assert.rejects(
    claimJobs(f.t, {
      secret: "wrong",
      discordGuildIds: [guildDiscordId],
    }),
    /secret/
  )
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
        await f.t.action(api.liveNotificationActions.begin, {
          secret,
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
    await f.t.action(api.liveNotificationActions.begin, {
      secret,
      deliveryId: job._id,
      claim: job.claim,
      configUpdatedAt: job.config.updatedAt,
    }),
    false
  )
  await f.t.action(api.liveNotificationActions.finish, {
    secret,
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
    secret,
    deliveryId: job._id,
    claim: job.claim,
    configUpdatedAt: job.config.updatedAt,
  }
  f.setUnavailable()
  assert.equal(
    await f.t.action(api.liveNotificationActions.begin, input),
    false
  )
  assert.equal((await f.t.run((ctx) => ctx.db.get(job._id)))?.state, "claimed")
})

test("authenticated runtime source contract validates requests, records health and fails visibly on outages", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  const request = (
    body: string | ArrayBuffer,
    authorization = "Bearer test-runtime-secret"
  ) =>
    f.t.fetch("/twitch-live-sources", {
      method: "POST",
      headers: { Authorization: authorization },
      body,
    })
  for (const authorization of ["", "Bearer wrong", "test-runtime-secret"])
    assert.equal((await request('{"states":[]}', authorization)).status, 401)
  for (const body of [
    "invalid",
    "{}",
    '{"states":[{"broadcasterId":"123","status":"forged"}]}',
    '{"states":[{"broadcasterId":"nonsense","status":"ready"}]}',
    '{"states":[],"cursor":123}',
    '{"states":[],"cursor":{}}',
    JSON.stringify({ states: [], cursor: "x".repeat(4097) }),
    '{"states":[],"healthOnly":null}',
    '{"states":[],"healthOnly":"true"}',
  ])
    assert.equal((await request(body)).status, 400)
  assert.equal((await request("x".repeat(65537))).status, 413)
  assert.equal((await request(new Uint8Array([0xc3, 0x28]).buffer)).status, 400)
  const response = await request(
    JSON.stringify({ states: [{ broadcasterId: "222", status: "ready" }] })
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    broadcasterIds: ["222"],
    continueCursor: null,
  })
  assert.equal(
    (
      await f.manager.action(api.liveNotificationActions.get, {
        discordGuildId: guildDiscordId,
      })
    ).subscriptionStatus,
    "ready"
  )
  await f.t.run(async (ctx) => {
    for (let index = 0; index < 25; index++) {
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: `http-page-${index}`,
        ownerDiscordId,
        name: "Page target",
        createdAt: 1,
        updatedAt: 1,
      })
      const { discordGuildId: _discordGuildId, ...liveConfig } = config
      await ctx.db.insert("guildLiveNotificationConfigs", {
        guildId,
        ...liveConfig,
        createdAt: 1,
        updatedAt: 1,
      })
    }
  })
  const page = await (await request('{"states":[],"cursor":null}')).json()
  assert.ok(page.continueCursor)
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.query("guildLiveNotificationConfigs").collect()
      )
    ).filter((row) => row.broadcasterId === "222").length,
    25
  )
  const next = await request(
    JSON.stringify({ states: [], cursor: page.continueCursor })
  )
  assert.equal(next.status, 200)
  assert.equal((await next.json()).continueCursor, null)
  assert.equal(
    (
      await f.t.run((ctx) =>
        ctx.db.query("guildLiveNotificationConfigs").collect()
      )
    ).filter((row) => row.broadcasterId === "222").length,
    26
  )
  f.setUnavailable()
  await f.t.run(async (ctx) => {
    const check = await ctx.db.query("twitchLiveOwnerChecks").unique()
    if (check)
      await ctx.db.patch(check._id, { checkedAt: Date.now() - 6 * 60000 })
  })
  assert.equal((await request('{"states":[]}')).status, 503)
  const healthOnly = await request(
    JSON.stringify({
      states: [{ broadcasterId: "222", status: "unavailable" }],
      healthOnly: true,
    })
  )
  assert.equal(healthOnly.status, 200)
  assert.deepEqual(await healthOnly.json(), {
    broadcasterIds: [],
    continueCursor: null,
  })
  assert.equal(
    (
      await f.t.query(internal.liveNotifications.subscription, {
        broadcasterId: "222",
      })
    )?.status,
    "unavailable"
  )
})

test("verified stream.online HTTP ingress persists before acknowledgement and dedupes signed redelivery", async () => {
  const f = await fixture()
  const body = JSON.stringify({
    subscription: {
      id: "online-subscription",
      type: "stream.online",
      version: "1",
      condition: { broadcaster_user_id: "222" },
    },
    event: {
      id: "9001",
      broadcaster_user_id: "222",
      broadcaster_user_login: "verified_owner",
      broadcaster_user_name: "Owner",
      type: "live",
      started_at: event.startedAt,
    },
  })
  const timestamp = new Date().toISOString()
  for (const id of ["first-message", "first-message", "second-message"]) {
    const signature = createHmac("sha256", process.env.TWITCH_EVENTSUB_SECRET!)
      .update(id + timestamp + body)
      .digest("hex")
    const response = await f.t.fetch("/twitch-eventsub", {
      method: "POST",
      body,
      headers: {
        "Twitch-Eventsub-Message-Id": id,
        "Twitch-Eventsub-Message-Timestamp": timestamp,
        "Twitch-Eventsub-Message-Signature": `sha256=${signature}`,
        "Twitch-Eventsub-Message-Type": "notification",
      },
    })
    assert.equal(response.status, 204)
  }
  const events = await f.t.run((ctx) =>
    ctx.db.query("twitchLiveEvents").collect()
  )
  assert.equal(events.length, 1)
  assert.equal(events[0]?.streamId, "9001")
  assert.equal(events[0]?.state, "pending")
})

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
  args: FunctionArgs<typeof api.liveNotificationActions.claim>
) {
  return (await t.action(api.liveNotificationActions.claim, args)).deliveries
}

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

test("source reconciliation paginates beyond 500 guilds and verifies a repeated owner only once across pages", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 525; i++) {
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: String(600000000000000000n + BigInt(i)),
        ownerDiscordId,
        name: "Owned server",
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert("guildLiveNotificationConfigs", {
        guildId,
        liveNotificationsEnabled: true,
        liveNotificationChannelId: channelId,
        liveNotificationMentionMode: "none",
        createdAt: 1,
        updatedAt: 1,
      })
    }
  })
  const fetch = globalThis.fetch
  let verifications = 0
  let streamLookups = 0
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/users/owner")) verifications++
    if (String(input).includes("helix/streams")) streamLookups++
    return fetch(input, init)
  }
  let cursor: string | null = null
  let pages = 0
  do {
    const page: Awaited<
      ReturnType<
        typeof f.t.action<
          typeof internal.liveNotificationActions.runtimeSources
        >
      >
    > = await f.t.action(internal.liveNotificationActions.runtimeSources, {
      cursor,
    })
    assert.deepEqual(page.broadcasterIds, ["222"])
    cursor = page.continueCursor
    pages++
  } while (cursor)
  assert.equal(pages, 22)
  assert.equal(verifications, 1)
  let matching = 0
  cursor = null
  do {
    const page: FunctionReturnType<
      typeof internal.liveNotifications.configured
    > = await f.t.query(internal.liveNotifications.configured, {
      cursor,
      broadcasterId: "222",
    })
    matching += page.targets.length
    cursor = page.isDone ? null : page.continueCursor
  } while (cursor)
  assert.equal(matching, 526)
  verifications = 0
  const eventId = await receiveEvent(f.t, event)
  await f.t.action(internal.liveNotificationActions.processEvent, { eventId })
  assert.equal(
    (await f.t.run((ctx) => ctx.db.query("twitchLiveDeliveries").collect()))
      .length,
    526
  )
  assert.equal(verifications, 1)
  assert.equal(streamLookups, 1)
  assert.equal(
    (
      await f.t.query(internal.liveNotifications.configured, {
        broadcasterId: "333",
      })
    ).targets.length,
    0
  )
  f.setUnavailable()
  await f.t.run(async (ctx) => {
    const check = await ctx.db.query("twitchLiveOwnerChecks").unique()
    assert.ok(check)
    await ctx.db.patch(check._id, { checkedAt: 0 })
  })
  await assert.rejects(
    f.t.action(internal.liveNotificationActions.runtimeSources, {}),
    /unavailable/
  )
  assert.equal(
    (
      await f.t.query(internal.liveNotifications.configured, {
        broadcasterId: "222",
      })
    ).targets.length,
    25
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

test("queue claims are bounded to pending work, preserve runtime guild ownership and coalesce stale jobs", async () => {
  const f = await fixture()
  assert.deepEqual(
    await f.t.action(api.liveNotificationActions.claim, {
      secret,
      discordGuildIds: [guildDiscordId],
    }),
    { deliveries: [], continueCursor: null }
  )
  await f.manager.action(api.liveNotificationActions.update, config)
  const id = await receiveEvent(f.t, event)
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: id,
  })
  const template = await f.t.run((ctx) =>
    ctx.db.query("twitchLiveDeliveries").unique()
  )
  assert.ok(template)
  const { _id: _id, _creationTime: _creationTime, ...fields } = template
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 24; i++)
      await ctx.db.insert("twitchLiveDeliveries", {
        ...fields,
        streamId: String(10000 + i),
        discordGuildId: i === 0 ? "999999999999999999" : guildDiscordId,
      })
  })
  const pending = await f.t.query(internal.liveNotifications.pending, {})
  assert.equal(pending.deliveries.length, 20)
  assert.ok(pending.continueCursor)
  const first = await f.t.action(api.liveNotificationActions.claim, {
    secret,
    discordGuildIds: [guildDiscordId],
  })
  assert.equal(first.deliveries.length, 4)
  assert.equal(first.continueCursor, null)
  const second = await f.t.action(api.liveNotificationActions.claim, {
    secret,
    discordGuildIds: [guildDiscordId],
    cursor: first.continueCursor,
  })
  assert.equal(second.deliveries.length, 4)
  assert.equal(second.continueCursor, null)
  await f.manager.action(api.liveNotificationActions.update, {
    ...config,
    liveNotificationsEnabled: false,
  })
  for (const job of first.deliveries.slice(0, 2))
    await f.t.mutation(internal.liveNotifications.expire, {
      deliveryId: job._id,
      claim: job.claim,
    })
  assert.deepEqual(
    await claimJobs(f.t, { secret, discordGuildIds: [guildDiscordId] }),
    []
  )
  assert.equal(
    (await f.t.run((ctx) => ctx.db.get(first.deliveries[0]!._id)))?.state,
    "cancelled"
  )
})

test("queue cancels departed and deleted foreign guilds but leaves eligible foreign work pending", async () => {
  const f = await fixture()
  await f.manager.action(api.liveNotificationActions.update, config)
  const id = await receiveEvent(f.t, event)
  await f.t.action(internal.liveNotificationActions.processEvent, {
    eventId: id,
  })
  const template = await f.t.run((ctx) =>
    ctx.db.query("twitchLiveDeliveries").unique()
  )
  assert.ok(template)
  const { _id: _id, _creationTime: _creationTime, ...fields } = template
  const foreign = await f.t.run(async (ctx) => {
    const result = []
    const { discordGuildId: _discordGuildId, ...liveConfig } = config
    for (const state of ["eligible", "left", "deleted"] as const) {
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: `foreign-${state}`,
        ownerDiscordId,
        name: state,
        createdAt: 1,
        updatedAt: 1,
        ...(state === "left" ? { botLeftAt: 2 } : {}),
      })
      await ctx.db.insert("guildLiveNotificationConfigs", {
        guildId,
        ...liveConfig,
        createdAt: 1,
        updatedAt: 1,
      })
      const deliveryId = await ctx.db.insert("twitchLiveDeliveries", {
        ...fields,
        guildId,
        discordGuildId: `foreign-${state}`,
      })
      if (state === "deleted") await ctx.db.delete(guildId)
      result.push({ deliveryId, state })
    }
    return result
  })
  await f.t.action(api.liveNotificationActions.claim, {
    secret,
    discordGuildIds: [guildDiscordId],
  })
  for (const row of foreign)
    assert.equal(
      (await f.t.run((ctx) => ctx.db.get(row.deliveryId)))?.state,
      row.state === "eligible" ? "pending" : "cancelled"
    )
  const cancellations = await f.t.run((ctx) =>
    ctx.db.query("guildAuditEvents").collect()
  )
  assert.equal(
    cancellations.filter(
      (entry) => entry.eventType === "bot.twitch_live_notification.cancelled"
    ).length,
    1
  )
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
    await f.t.action(api.liveNotificationActions.begin, {
      secret,
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
        await f.t.action(api.liveNotificationActions.begin, {
          secret,
          deliveryId: job._id,
          claim: job.claim,
          configUpdatedAt: job.config.updatedAt,
        }),
        true
      )
    await f.t.action(api.liveNotificationActions.finish, {
      secret,
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
      await f.t.action(api.liveNotificationActions.begin, {
        secret,
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

test("subscription health avoids unchanged heartbeat writes but records changes and freshness renewal", async () => {
  const f = await fixture()
  const states = [{ broadcasterId: "222", status: "ready" as const }]
  await f.t.mutation(internal.liveNotifications.subscriptions, { states })
  const before = await f.t.query(internal.liveNotifications.subscription, {
    broadcasterId: "222",
  })
  await f.t.mutation(internal.liveNotifications.subscriptions, { states })
  assert.deepEqual(
    await f.t.query(internal.liveNotifications.subscription, {
      broadcasterId: "222",
    }),
    before
  )
  await f.t.mutation(internal.liveNotifications.subscriptions, {
    states: [{ broadcasterId: "222", status: "unavailable" }],
  })
  assert.equal(
    (
      await f.t.query(internal.liveNotifications.subscription, {
        broadcasterId: "222",
      })
    )?.status,
    "unavailable"
  )
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

test("runtime HTTP enforces streaming UTF-8 bytes and keeps internal errors out of responses", async () => {
  const f = await fixture()
  for (const body of [
    '{"states":[],"padding":"' + "é".repeat(33000) + '"}',
    "x".repeat(65537),
  ]) {
    assert.equal(
      (
        await f.t.fetch("/twitch-live-sources", {
          method: "POST",
          body,
          headers: { Authorization: "Bearer test-runtime-secret" },
        })
      ).status,
      413
    )
  }
})

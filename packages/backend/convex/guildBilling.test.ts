import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import { FREE_WELCOME_STYLE } from "@workspace/shared/welcomeCard"
import { GUILD_BILLING_MAX_FRESHNESS_MS } from "@workspace/shared/cleoEntitlements"
import * as billingFunctions from "./mutations/internal/guildBilling"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./mutations/internal/guildBilling.ts": () =>
    import("./mutations/internal/guildBilling"),
  "./queries/internal/guildEntitlements.ts": () =>
    import("./queries/internal/guildEntitlements"),
  "./mutations/dashboard/discord/guildConfigs/updateWorkspaceSection.ts": () =>
    import("./mutations/dashboard/discord/guildConfigs/updateWorkspaceSection"),
  "./mutations/dashboard/discord/guildConfigs/updateChannels.ts": () =>
    import("./mutations/dashboard/discord/guildConfigs/updateChannels"),
  "./queries/dashboard/discord/guilds/overview.ts": () =>
    import("./queries/dashboard/discord/guilds/overview"),
  "./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId.ts": () =>
    import("./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId"),
}
const billing = internal.mutations.internal.guildBilling
const resolve = internal.queries.internal.guildEntitlements.resolve
const save =
  api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection.update
const runtime =
  internal.queries.bot.discord.guildConfigs.runtimeConfigByDiscordId.get
const overview = api.queries.dashboard.discord.guilds.overview.get
const guildA = "123456789012345678"
const guildB = "234567890123456789"
const premiumStyle = {
  ...FREE_WELCOME_STYLE,
  preset: "aurora",
  palette: "orchid",
} as const

async function fixture() {
  const t = convexTest({ schema, modules })
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "owner",
      email: "owner@example.com",
      role: "user",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    })
    const staffId = await ctx.db.insert("users", {
      clerkUserId: "staff",
      email: "staff@example.com",
      role: "staff",
      createdAt: 1,
      updatedAt: 1,
    })
    const guildIds = []
    for (const discordGuildId of [guildA, guildB]) {
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId,
        name: "Test guild",
        botJoinedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      guildIds.push(guildId)
      await ctx.db.insert("discordGuildMemberships", {
        guildId,
        userId,
        discordUserId: "345678901234567890",
        canManage: true,
        permissions: "32",
        managementVerifiedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
    }
    return { userId, staffId, guildIds }
  })
  const customerId = await t.mutation(billing.associateCustomer, {
    clerkUserId: "owner",
    stripeCustomerId: "cus_owner",
  })
  await t.mutation(billing.configurePrice, {
    stripeProductId: "prod_premium",
    stripePriceId: "price_monthly",
    enabled: true,
  })
  const now = Date.now()
  const snapshot = {
    stripeCustomerId: "cus_owner",
    discordGuildId: guildA,
    stripeSubscriptionId: "sub_a",
    stripeProductId: "prod_premium",
    stripePriceId: "price_monthly",
    eventId: "evt_1",
    eventCreatedAt: now,
    revision: 1,
    status: "active" as const,
    startsAt: now - 1000,
    endsAt: now + 30 * 86400000,
    cancelAtPeriodEnd: false,
  }
  const manager = t.withIdentity({ subject: "owner" })
  return { t, manager, ids, snapshot, customerId, now }
}

test("billing writes are internal-only", () => {
  for (const fn of Object.values(billingFunctions))
    assert.equal(fn.isInternal, true)
})

test("subscriptions grant only the selected guild; paid saving, overview and runtime agree", async () => {
  const { t, manager, snapshot, ids } = await fixture()
  await t.mutation(billing.reconcileSubscription, snapshot)
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    ["guild.twitch.premium-style", "guild.welcome.premium-style"]
  )
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildB })).capabilities,
    []
  )
  const saved = await manager.mutation(save, {
    discordGuildId: guildA,
    modules: { welcomeEnabled: true },
    channels: {},
    welcome: { style: premiumStyle },
  })
  assert.deepEqual(saved.welcomeStyle, premiumStyle)
  const visible = await manager.query(overview, { discordGuildId: guildA })
  assert.equal(visible.status, "ready")
  if (visible.status !== "ready") throw new Error("Missing overview")
  assert.equal(visible.overview.welcomeCardStudioAvailable, true)
  assert.deepEqual(visible.overview.guildConfig?.welcomeStyle, premiumStyle)
  const result = await t.query(runtime, { discordGuildId: guildA })
  assert.equal(result.status, "ready")
  if (result.status !== "ready") throw new Error("Missing runtime")
  assert.deepEqual(result.config.welcomeStyle, premiumStyle)
  assert.ok(result.config.premiumWelcomeValidUntil)
  await assert.rejects(
    manager.mutation(save, {
      discordGuildId: guildB,
      modules: {},
      channels: {},
      welcome: { style: premiumStyle },
    }),
    /PREMIUM_WELCOME_UNAVAILABLE/
  )
  // Owning the billing customer never replaces manager authority.
  await t.run(async (ctx) => {
    const memberships = await ctx.db.query("discordGuildMemberships").collect()
    for (const membership of memberships)
      await ctx.db.patch(membership._id, { canManage: false, permissions: "0" })
  })
  await assert.rejects(
    manager.mutation(save, {
      discordGuildId: guildA,
      modules: {},
      channels: {},
      welcome: { style: premiumStyle },
    }),
    /FORBIDDEN/
  )
  await assert.rejects(
    t.withIdentity({ subject: "staff" }).mutation(save, {
      discordGuildId: guildA,
      modules: {},
      channels: {},
      welcome: { style: premiumStyle },
    }),
    /FORBIDDEN/
  )
  assert.equal(
    (await t.query(resolve, { discordGuildId: guildA })).state,
    "active"
  )
  assert.ok(ids.userId)
})

test("customer ownership, cross-guild subscription rebinding and conflicting event reuse fail", async () => {
  const { t, snapshot, customerId } = await fixture()
  assert.equal(
    await t.mutation(billing.associateCustomer, {
      clerkUserId: "owner",
      stripeCustomerId: "cus_owner",
    }),
    customerId
  )
  await assert.rejects(
    t.mutation(billing.associateCustomer, {
      clerkUserId: "staff",
      stripeCustomerId: "cus_owner",
    }),
    /ownership cannot be reassigned/
  )
  await assert.rejects(
    t.mutation(billing.associateCustomer, {
      clerkUserId: "missing",
      stripeCustomerId: "cus_unknown",
    }),
    /active Clerk user/
  )
  await assert.rejects(
    t.mutation(billing.associateCustomer, {
      clerkUserId: "owner",
      stripeCustomerId: "cus_second",
    }),
    /already has/
  )
  await t.mutation(billing.reconcileSubscription, snapshot)
  assert.equal(
    await t.mutation(billing.reconcileSubscription, snapshot),
    "duplicate"
  )
  await assert.rejects(
    t.mutation(billing.reconcileSubscription, {
      ...snapshot,
      endsAt: snapshot.endsAt + 1,
    }),
    /reused/
  )
  await assert.rejects(
    t.mutation(billing.reconcileSubscription, {
      ...snapshot,
      discordGuildId: guildB,
      eventId: "evt_other",
      revision: 2,
    }),
    /cannot be reassigned/
  )
  assert.equal(
    (await t.run((ctx) => ctx.db.query("billingEvents").collect())).length,
    1
  )
  // The same customer can buy a separate subscription for a second guild.
  await t.mutation(billing.reconcileSubscription, {
    ...snapshot,
    discordGuildId: guildB,
    stripeSubscriptionId: "sub_b",
    eventId: "evt_b",
  })
  assert.equal(
    (await t.query(resolve, { discordGuildId: guildB })).state,
    "active"
  )
})

test("trial, grace, recovery, scheduled cancellation and immediate cancellation transition correctly", async () => {
  const { t, snapshot, now } = await fixture()
  await t.mutation(billing.reconcileSubscription, {
    ...snapshot,
    status: "trialing",
    trialEndsAt: now + 10000,
  })
  assert.equal(
    (await t.query(resolve, { discordGuildId: guildA })).state,
    "trial"
  )
  await t.mutation(billing.reconcileSubscription, {
    ...snapshot,
    eventId: "evt_2",
    revision: 2,
    status: "past_due",
    endsAt: now - 1,
    paymentFailedAt: now - 10,
    graceEndsAt: now + 10000,
  })
  const grace = await t.query(resolve, { discordGuildId: guildA })
  assert.equal(grace.state, "grace")
  assert.equal(grace.validUntil, now + 10000)
  await assert.rejects(
    t.mutation(billing.reconcileSubscription, {
      ...snapshot,
      eventId: "evt_extend",
      revision: 3,
      status: "past_due",
      paymentFailedAt: now,
      graceEndsAt: now + 20000,
    }),
    /Grace cannot restart/
  )
  await t.mutation(billing.reconcileSubscription, {
    ...snapshot,
    eventId: "evt_3",
    revision: 3,
    cancelAtPeriodEnd: true,
  })
  assert.equal(
    (await t.query(resolve, { discordGuildId: guildA })).state,
    "active"
  )
  assert.equal(
    await t.mutation(billing.reconcileSubscription, {
      ...snapshot,
      eventId: "evt_stale",
      revision: 2,
      status: "unpaid",
    }),
    "stale"
  )
  assert.equal(
    (await t.query(resolve, { discordGuildId: guildA })).state,
    "active"
  )
  await t.mutation(billing.reconcileSubscription, {
    ...snapshot,
    eventId: "evt_cancel",
    revision: 4,
    status: "canceled",
    canceledAt: now,
  })
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    []
  )
  assert.equal(
    await t.mutation(billing.reconcileSubscription, {
      ...snapshot,
      eventId: "evt_old",
      revision: 3,
    }),
    "stale"
  )
  await assert.rejects(
    t.mutation(billing.reconcileSubscription, {
      ...snapshot,
      eventId: "evt_reopen",
      revision: 5,
    }),
    /terminated subscription/
  )
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    []
  )
})

test("expiry, revocation and stale reconciliation downgrade runtime while retaining customisations", async () => {
  for (const status of [
    "expired",
    "revoked",
    "unpaid",
    "paused",
    "incomplete",
    "incomplete_expired",
  ] as const) {
    const { t, manager, snapshot, now } = await fixture()
    await t.mutation(billing.reconcileSubscription, snapshot)
    const saved = await manager.mutation(save, {
      discordGuildId: guildA,
      modules: { welcomeEnabled: true },
      channels: {},
      welcome: { style: premiumStyle },
    })
    await t.mutation(billing.reconcileSubscription, {
      ...snapshot,
      eventId: "evt_down",
      revision: 2,
      status,
      ...(status === "revoked" ? { revokedAt: now } : {}),
    })
    assert.deepEqual(
      (await t.query(resolve, { discordGuildId: guildA })).capabilities,
      []
    )
    const result = await t.query(runtime, { discordGuildId: guildA })
    if (result.status !== "ready") throw new Error("Missing runtime")
    assert.deepEqual(result.config.welcomeStyle, FREE_WELCOME_STYLE)
    assert.equal(result.config.premiumWelcomeValidUntil, undefined)
    const edited = await manager.mutation(save, {
      discordGuildId: guildA,
      modules: {},
      channels: {},
      welcome: { subtext: "Still free" },
    })
    assert.deepEqual(edited.welcomeStyle, premiumStyle)
    await manager.mutation(
      api.mutations.dashboard.discord.guildConfigs.updateChannels.update,
      {
        discordGuildId: guildA,
        channels: { welcomeChannelId: "345678901234567890" },
      }
    )
    assert.deepEqual(
      (await t.run((ctx) => ctx.db.get(saved._id)))?.welcomeStyle,
      premiumStyle
    )
    if (status === "revoked")
      await assert.rejects(
        t.mutation(billing.reconcileSubscription, {
          ...snapshot,
          eventId: "evt_restore",
          revision: 3,
        }),
        /cannot be restored/
      )
  }
  const { t, snapshot, now } = await fixture()
  await t.mutation(billing.reconcileSubscription, {
    ...snapshot,
    startsAt: now - 10 * 86400000,
    eventCreatedAt: now - GUILD_BILLING_MAX_FRESHNESS_MS - 1,
  })
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    []
  )
  await t.mutation(billing.reconcileSubscription, {
    ...snapshot,
    eventId: "evt_expired",
    revision: 2,
    endsAt: now - 1,
  })
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    []
  )
})

test("invalid states and unapproved or disabled prices cannot grant Premium", async () => {
  const { t, snapshot, now } = await fixture()
  for (const patch of [
    { stripeCustomerId: "invalid" },
    { stripeSubscriptionId: "invalid" },
    { stripeProductId: "invalid" },
    { stripePriceId: "invalid" },
    { stripePriceId: "price_unknown" },
    { stripeProductId: "prod_other" },
    { discordGuildId: "bad" },
    { discordGuildId: "999999999999999999" },
    { stripeCustomerId: "cus_unknown" },
    { eventId: " " },
    { revision: 0 },
    { startsAt: now + 100 },
    { endsAt: snapshot.startsAt },
    { eventCreatedAt: now + 10000 },
    { graceEndsAt: now + 100 },
    { status: "trialing" as const },
    { status: "past_due" as const },
    { status: "revoked" as const },
    { status: "canceled" as const },
    { revokedAt: now },
    { canceledAt: now },
    {
      status: "past_due" as const,
      paymentFailedAt: now - 1,
      graceEndsAt: now + 8 * 86400000,
    },
  ])
    await assert.rejects(
      t.mutation(billing.reconcileSubscription, { ...snapshot, ...patch }),
      /INVALID_BILLING_STATE/
    )
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    []
  )
  await t.mutation(billing.reconcileSubscription, snapshot)
  await t.mutation(billing.configurePrice, {
    stripeProductId: "prod_premium",
    stripePriceId: "price_monthly",
    enabled: false,
  })
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    []
  )
})

test("staff-issued grants are expiring, scoped, idempotent and revocable", async () => {
  const { t, ids, now } = await fixture()
  const grant = {
    grantKey: "beta-welcome",
    discordGuildId: guildA,
    category: "test" as const,
    capabilities: ["guild.welcome.premium-style" as const],
    startsAt: now - 1,
    endsAt: now + 10000,
    issuedBy: ids.staffId,
    reason: "Development guild Welcome Card verification",
  }
  for (const patch of [
    { endsAt: now - 1 },
    { endsAt: now + 8 * 86400000 },
    { issuedBy: ids.userId },
    { capabilities: [] },
    { reason: " " },
    { discordGuildId: guildB + "9" },
  ]) {
    await assert.rejects(
      t.mutation(billing.issueGrant, { ...grant, ...patch }),
      /INVALID_BILLING_STATE/
    )
  }
  const id = await t.mutation(billing.issueGrant, grant)
  assert.equal(await t.mutation(billing.issueGrant, grant), id)
  await assert.rejects(
    t.mutation(billing.issueGrant, { ...grant, discordGuildId: guildB }),
    /cannot be reused/
  )
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildA })).capabilities,
    ["guild.welcome.premium-style"]
  )
  assert.deepEqual(
    (await t.query(resolve, { discordGuildId: guildB })).capabilities,
    []
  )
  await assert.rejects(
    t.mutation(billing.revokeGrant, {
      grantKey: grant.grantKey,
      revokedBy: ids.userId,
      reason: "Denied",
    }),
    /INVALID_BILLING_STATE/
  )
  await t.mutation(billing.revokeGrant, {
    grantKey: grant.grantKey,
    revokedBy: ids.staffId,
    reason: "Finished testing",
  })
  await t.mutation(billing.revokeGrant, {
    grantKey: grant.grantKey,
    revokedBy: ids.staffId,
    reason: "Retry",
  })
  assert.equal(
    (await t.query(resolve, { discordGuildId: guildA })).state,
    "revoked"
  )
  assert.equal(
    (await t.run((ctx) => ctx.db.get(id)))?.revocationReason,
    "Finished testing"
  )
  for (const category of ["staff", "complimentary"] as const) {
    await t.mutation(billing.issueGrant, {
      ...grant,
      grantKey: category,
      category,
    })
  }
  assert.equal(
    (await t.query(resolve, { discordGuildId: guildA })).state,
    "active"
  )
  assert.equal(
    (await t.query(resolve, { discordGuildId: "999999999999999999" })).state,
    "expired"
  )
})

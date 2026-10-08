import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { convexTest, type TestConvex } from "convex-test"

import { api, internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { canManageInstalledGuild } from "./lib/discordRest"
import schema from "./schema"
import { FREE_WELCOME_STYLE } from "@workspace/shared/welcomeCard"
import { ConvexError } from "convex/values"

process.env.DISCORD_BOT_TOKEN = "test-token"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./actions/dashboard/discord/guilds/configOptions.ts": () =>
    import("./actions/dashboard/discord/guilds/configOptions"),
  "./queries/dashboard/discord/guilds/accessContext.ts": () =>
    import("./queries/dashboard/discord/guilds/accessContext"),
  "./queries/dashboard/discord/guilds/overview.ts": () =>
    import("./queries/dashboard/discord/guilds/overview"),
  "./mutations/dashboard/discord/guilds/upsertRestVerified.ts": () =>
    import("./mutations/dashboard/discord/guilds/upsertRestVerified"),
  "./mutations/dashboard/discord/guildConfigs/updateModules.ts": () =>
    import("./mutations/dashboard/discord/guildConfigs/updateModules"),
  "./mutations/dashboard/discord/guildConfigs/updateChannels.ts": () =>
    import("./mutations/dashboard/discord/guildConfigs/updateChannels"),
  "./mutations/dashboard/discord/guildConfigs/updateWorkspaceSection.ts": () =>
    import("./mutations/dashboard/discord/guildConfigs/updateWorkspaceSection"),
  "./mutations/dashboard/discord/guildSupportConfigs/update.ts": () =>
    import("./mutations/dashboard/discord/guildSupportConfigs/update"),
  "./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId.ts": () =>
    import("./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId"),
}

const discordGuildId = "123456789012345678"
const channelId = "234567890123456789"
const nextChannelId = "345678901234567890"
const discordUserId = "456789012345678901"
const originalFetch = globalThis.fetch

test("Premium welcome saves fail closed per guild without changing free configuration", async () => {
  const t = convexTest({ schema, modules })
  const guildId = await seedGuild(t)
  const userId = await seedUser(t)
  await t.run((ctx) =>
    ctx.db.insert("discordGuildMemberships", {
      guildId,
      userId,
      discordUserId,
      canManage: true,
      isOwner: false,
      permissions: "32",
      managementVerifiedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
  )
  const manager = t.withIdentity({ subject: "manager" })
  const mutation =
    api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection.update
  const free = await manager.mutation(mutation, {
    discordGuildId,
    modules: { welcomeEnabled: true },
    channels: { welcomeChannelId: channelId },
    welcome: { subtext: "Keep free 👋🏽", style: FREE_WELCOME_STYLE },
  })
  for (const change of [
    { preset: "aurora" },
    { palette: "orchid" },
    { align: "center" },
    { greeting: "Hello {member}" },
  ]) {
    await assert.rejects(
      manager.mutation(mutation, {
        discordGuildId,
        modules: { welcomeEnabled: false },
        channels: {},
        welcome: {
          subtext: "Denied",
          style: { ...FREE_WELCOME_STYLE, ...change },
        },
      }),
      /PREMIUM_WELCOME_UNAVAILABLE/
    )
  }
  await assert.rejects(
    manager.mutation(mutation, {
      discordGuildId,
      modules: {},
      channels: {},
      welcome: { style: { ...FREE_WELCOME_STYLE, preset: "unknown" } },
    }),
    (error: unknown) =>
      error instanceof ConvexError &&
      error.data.code === "INVALID_WELCOME_STYLE" &&
      error.data.message === "Unknown welcome-card preset"
  )
  assert.deepEqual(await t.run((ctx) => ctx.db.get(free._id)), free)
  const otherId = "987654321098765432"
  await t.run((ctx) =>
    ctx.db.insert("guilds", {
      discordGuildId: otherId,
      name: "Other guild",
      botJoinedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
  )
  await assert.rejects(
    manager.mutation(mutation, {
      discordGuildId: otherId,
      modules: {},
      channels: {},
      welcome: { style: { ...FREE_WELCOME_STYLE, preset: "ribbon" } },
    }),
    (error: unknown) =>
      error instanceof ConvexError && error.data.code === "FORBIDDEN"
  )
  assert.deepEqual(await t.run((ctx) => ctx.db.get(free._id)), free)
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

async function seedGuild(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId,
      name: "Managed guild",
      botJoinedAt: 1,
      staffMetricsTracked: true,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert("guildSupportConfigs", {
      guildId,
      enabled: true,
      targetId: channelId,
      targetType: "channel",
      staffRoleIds: [discordUserId],
      transcriptPolicy: "explicit-messages",
      escalationPolicy: "none",
      createdAt: 1,
      updatedAt: 1,
    })
    return guildId
  })
}

async function seedUser(
  t: TestConvex<typeof schema>,
  role: Doc<"users">["role"] = "user"
) {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "manager",
      email: "manager@example.com",
      role,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    })
  )
}

test("REST verification returns schema-valid guilds and restores manager access for new and existing guilds", async () => {
  for (const existing of [false, true]) {
    const t = convexTest({ schema, modules })
    const userId = await seedUser(t)
    if (existing) await seedGuild(t)
    const guild = await t.mutation(
      internal.mutations.dashboard.discord.guilds.upsertRestVerified.upsert,
      {
        discordGuildId,
        name: "Managed guild",
        userId,
        discordUserId,
        canManage: true,
        permissions: "32",
        botInstallationVerifiedAt: 2,
        managementVerifiedAt: 2,
        managementVerificationSource: "discord-oauth",
        lastSyncedAt: 2,
      }
    )
    assert.equal(guild.staffMetricsTracked, true)
    const context = await t
      .withIdentity({ subject: "manager" })
      .query(
        internal.queries.dashboard.discord.guilds.accessContext
          .getManagedGuildContext,
        { discordGuildId }
      )
    assert.equal(context.status, "ready")
  }
})

const authorizedCases = [
  { name: "manager", permissions: "32", isOwner: false, role: "user" },
  { name: "Discord admin", permissions: "8", isOwner: false, role: "user" },
  { name: "owner", permissions: "0", isOwner: true, role: "user" },
  { name: "staff manager", permissions: "32", isOwner: false, role: "staff" },
  { name: "admin manager", permissions: "32", isOwner: false, role: "admin" },
  {
    name: "superadmin manager",
    permissions: "32",
    isOwner: false,
    role: "superadmin",
  },
] satisfies {
  name: string
  permissions: string
  isOwner: boolean
  role: Doc<"users">["role"]
}[]

for (const actor of authorizedCases) {
  test(`${actor.name} can load options and persist ordinary configuration while support stays disabled`, async () => {
    const t = convexTest({ schema, modules })
    const guildId = await seedGuild(t)
    const userId = await seedUser(t, actor.role)
    await t.run((ctx) =>
      ctx.db.insert("discordGuildMemberships", {
        guildId,
        userId,
        discordUserId,
        canManage: canManageInstalledGuild(actor),
        isOwner: actor.isOwner,
        permissions: actor.permissions,
        managementVerifiedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
    )
    const manager = t.withIdentity({ subject: "manager" })
    const requests: string[] = []
    globalThis.fetch = async (input) => {
      const url = String(input)
      requests.push(url)
      if (url.endsWith(`/guilds/${discordGuildId}?with_counts=true`)) {
        return Response.json({ id: discordGuildId, name: "Managed guild" })
      }
      if (url.endsWith("/channels")) {
        return Response.json([{ id: channelId, name: "welcome", type: 0 }])
      }
      if (url.endsWith("/roles")) return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }
    const options = await manager.action(
      api.actions.dashboard.discord.guilds.configOptions.get,
      { discordGuildId }
    )
    assert.equal(options.status, "ready")
    if (options.status !== "ready") throw new Error("Expected channel options")
    assert.deepEqual(options.channels, [
      { id: channelId, name: "welcome", type: "text" },
    ])
    assert.ok(requests.some((url) => url.endsWith("/channels")))

    await manager.mutation(
      api.mutations.dashboard.discord.guildConfigs.updateModules.update,
      {
        discordGuildId,
        modules: {
          welcomeEnabled: true,
          moderationEnabled: true,
          loggingEnabled: true,
        },
      }
    )
    await manager.mutation(
      api.mutations.dashboard.discord.guildConfigs.updateChannels.update,
      {
        discordGuildId,
        channels: {
          welcomeChannelId: channelId,
          modLogChannelId: channelId,
          logChannelId: channelId,
        },
      }
    )
    await assert.rejects(
      manager.mutation(
        api.mutations.dashboard.discord.guildSupportConfigs.update.update,
        {
          discordGuildId,
          enabled: true,
          targetId: channelId,
          targetType: "channel",
          staffRoleIds: [discordUserId],
          transcriptPolicy: "explicit-messages",
          escalationPolicy: "none",
        }
      ),
      /SUPPORT_CONFIGURATION_DISABLED/
    )
    await manager.mutation(
      api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection
        .update,
      {
        discordGuildId,
        modules: { welcomeEnabled: true },
        channels: { welcomeChannelId: nextChannelId },
        welcome: { subtext: "Welcome aboard" },
        logging: { level: "medium" },
      }
    )
    const overview = await manager.query(
      api.queries.dashboard.discord.guilds.overview.get,
      { discordGuildId }
    )
    assert.equal(overview.status, "ready")
    if (overview.status !== "ready") throw new Error("Expected managed guild")
    assert.equal(overview.overview.welcomeCardStudioAvailable, false)
    const stored = await t.run(async (ctx) => ({
      config: await ctx.db.query("guildConfigs").unique(),
      support: await ctx.db.query("guildSupportConfigs").unique(),
      audits: await ctx.db.query("guildAuditEvents").collect(),
    }))
    assert.equal(stored.config?.welcomeEnabled, true)
    assert.equal(stored.config?.moderationEnabled, true)
    assert.equal(stored.config?.loggingEnabled, true)
    assert.equal(stored.config?.welcomeChannelId, nextChannelId)
    assert.equal(stored.config?.modLogChannelId, channelId)
    assert.equal(stored.config?.logChannelId, channelId)
    assert.equal(stored.config?.welcomeSubtext, "Welcome aboard")
    assert.equal(stored.config?.logLevel, "medium")
    assert.equal(stored.support?.updatedAt, 1)
    assert.equal(stored.audits.length, 3)
    const runtime = await t.query(
      internal.queries.bot.discord.guildConfigs.runtimeConfigByDiscordId.get,
      { discordGuildId }
    )
    assert.equal(runtime.status, "ready")
    if (runtime.status !== "ready")
      throw new Error("Expected runtime configuration")
    assert.equal(runtime.config.supportEnabled, false)
    assert.equal(runtime.config.welcomeEnabled, true)
    assert.equal(runtime.config.welcomeChannelId, nextChannelId)
  })
}

for (const role of ["user", "staff", "admin", "superadmin"] as const) {
  test(`${role} without verified guild management cannot load options or change configuration`, async () => {
    const t = convexTest({ schema, modules })
    const guildId = await seedGuild(t)
    const userId = await seedUser(t, role)
    await t.run((ctx) =>
      ctx.db.insert("discordGuildMemberships", {
        guildId,
        userId,
        discordUserId,
        canManage: false,
        permissions: "0",
        managementVerifiedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
    )
    const member = t.withIdentity({ subject: "manager" })
    let requests = 0
    globalThis.fetch = async () => {
      requests++
      throw new Error("Unauthorized Discord request")
    }
    assert.deepEqual(
      await member.action(
        api.actions.dashboard.discord.guilds.configOptions.get,
        { discordGuildId }
      ),
      { status: "forbidden" }
    )
    assert.equal(requests, 0)
    await assert.rejects(
      member.mutation(
        api.mutations.dashboard.discord.guildConfigs.updateModules.update,
        {
          discordGuildId,
          modules: { welcomeEnabled: true },
        }
      ),
      /FORBIDDEN/
    )
    await assert.rejects(
      member.mutation(
        api.mutations.dashboard.discord.guildConfigs.updateChannels.update,
        {
          discordGuildId,
          channels: { welcomeChannelId: channelId },
        }
      ),
      /FORBIDDEN/
    )
    await assert.rejects(
      member.mutation(
        api.mutations.dashboard.discord.guildConfigs.updateWorkspaceSection
          .update,
        {
          discordGuildId,
          modules: { welcomeEnabled: true },
          channels: { welcomeChannelId: channelId },
          welcome: { subtext: "Denied" },
        }
      ),
      /FORBIDDEN/
    )
    await t.run(async (ctx) => {
      assert.deepEqual(await ctx.db.query("guildConfigs").collect(), [])
      assert.deepEqual(await ctx.db.query("guildAuditEvents").collect(), [])
    })
  })
}

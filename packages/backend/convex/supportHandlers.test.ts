import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest, type TestConvex } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

process.env.DISCORD_BOT_CONVEX_SECRET = "test-bot-secret"

const modules = {
  "./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId.ts": () =>
    import("./queries/bot/discord/guildConfigs/runtimeConfigByDiscordId"),
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./actions/bot/discord/supportTickets/openOrResume.ts": () =>
    import("./actions/bot/discord/supportTickets/openOrResume"),
  "./actions/bot/discord/supportTickets/setRoutingThread.ts": () =>
    import("./actions/bot/discord/supportTickets/setRoutingThread"),
  "./mutations/bot/discord/supportTickets/openOrResume.ts": () =>
    import("./mutations/bot/discord/supportTickets/openOrResume"),
  "./mutations/bot/discord/supportTickets/setRoutingThread.ts": () =>
    import("./mutations/bot/discord/supportTickets/setRoutingThread"),
  "./mutations/dashboard/discord/guildSupportConfigs/update.ts": () =>
    import("./mutations/dashboard/discord/guildSupportConfigs/update"),
}

const GUILD_ID = "123456789012345678"
const REQUESTER_ID = "234567890123456789"
const TARGET_ID = "345678901234567890"
const ROLE_ID = "456789012345678901"

const disabledTickets = {
  code: "SUPPORT_TICKETS_DISABLED",
  message:
    "Support tickets are temporarily disabled while they are being rebuilt and tested.",
}
const disabledConfig = {
  code: "SUPPORT_CONFIGURATION_DISABLED",
  message:
    "Guild support configuration is temporarily disabled while support tickets are being rebuilt and tested.",
}

// convex-test serializes ConvexError data across function boundaries.
function hasContract(expected: { code: string; message: string }) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof Error && "data" in error)
    assert.deepEqual(
      typeof error.data === "string" ? JSON.parse(error.data) : error.data,
      expected
    )
    return true
  }
}

const configArgs = {
  discordGuildId: GUILD_ID,
  enabled: true,
  staffRoleIds: [ROLE_ID],
  targetId: TARGET_ID,
  targetType: "channel" as const,
  transcriptPolicy: "explicit-messages" as const,
  escalationPolicy: "jcn-product-only" as const,
}

async function snapshot(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => ({
    configs: await ctx.db.query("guildSupportConfigs").collect(),
    tickets: await ctx.db.query("supportTickets").collect(),
    messages: await ctx.db.query("supportTicketMessages").collect(),
    audits: await ctx.db.query("guildAuditEvents").collect(),
  }))
}

test("support configuration rejects enabling and all changes without writing or auditing", async () => {
  const t = convexTest({ schema, modules })
  const { guildId } = await seedManagedGuild(t)
  const asManager = t.withIdentity({ subject: "clerk-manager" })
  await assert.rejects(
    t.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      configArgs
    )
  )
  await assert.rejects(
    asManager.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      { ...configArgs, discordGuildId: "999999999999999999" }
    ),
    /GUILD_NOT_FOUND/
  )
  await assert.rejects(
    asManager.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      configArgs
    ),
    hasContract(disabledConfig)
  )
  assert.deepEqual(await snapshot(t), {
    configs: [],
    tickets: [],
    messages: [],
    audits: [],
  })

  await seedSupportConfig(t, "explicit-messages")
  const before = await snapshot(t)
  for (const changes of [
    {},
    { enabled: false, staffRoleIds: [], targetId: null },
    {
      transcriptPolicy: "metadata-only" as const,
      escalationPolicy: "none" as const,
    },
  ]) {
    await assert.rejects(
      asManager.mutation(
        api.mutations.dashboard.discord.guildSupportConfigs.update.update,
        { ...configArgs, ...changes }
      ),
      hasContract(disabledConfig)
    )
  }
  await t.run((ctx) => ctx.db.patch(guildId, { botLeftAt: 2 }))
  await assert.rejects(
    asManager.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      configArgs
    ),
    hasContract(disabledConfig)
  )
  assert.deepEqual(await snapshot(t), before)
})

test("mixed-version bot actions and internal mutations cannot open, resume, or route DM and guild tickets", async () => {
  const t = convexTest({ schema, modules })
  const { guildId } = await seedManagedGuild(t)
  await seedSupportConfig(t, "explicit-messages")
  const ticketId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("supportTickets", {
      scope: "guild",
      status: "closed",
      activeKey: `guild:${GUILD_ID}:${REQUESTER_ID}`,
      guildId,
      discordGuildId: GUILD_ID,
      requesterDiscordUserId: REQUESTER_ID,
      routingTargetId: TARGET_ID,
      routingTargetType: "forum",
      routingThreadId: ROLE_ID,
      transcriptPolicy: "explicit-messages",
      escalationPolicy: "jcn-product-only",
      source: "discord-help",
      openCount: 1,
      lastOpenedAt: 1,
      lastActivityAt: 1,
      createdAt: 1,
      updatedAt: 1,
      closedAt: 1,
    })
    await ctx.db.insert("supportTicketMessages", {
      ticketId: id,
      authorType: "requester",
      authorDiscordUserId: REQUESTER_ID,
      body: "Retained history",
      createdAt: 1,
    })
    return id
  })
  const before = await snapshot(t)
  for (const secret of ["wrong", "test-bot-secret"]) {
    const check =
      secret === "wrong"
        ? /Invalid Discord bot Convex secret/
        : hasContract(disabledTickets)
    for (const discordGuildId of [undefined, GUILD_ID]) {
      for (const requesterDiscordUserId of [
        REQUESTER_ID,
        "567890123456789012",
      ]) {
        const input = {
          requesterDiscordUserId,
          ...(discordGuildId ? { discordGuildId } : {}),
          message: "Do not store",
        }
        await assert.rejects(
          t.action(
            api.actions.bot.discord.supportTickets.openOrResume.openOrResume,
            { secret, input }
          ),
          check
        )
        await assert.rejects(
          t.mutation(
            internal.mutations.bot.discord.supportTickets.openOrResume
              .openOrResume,
            input
          ),
          hasContract(disabledTickets)
        )
      }
    }
    await assert.rejects(
      t.action(api.actions.bot.discord.supportTickets.setRoutingThread.set, {
        secret,
        ticketId,
        threadId: TARGET_ID,
      }),
      check
    )
  }
  await assert.rejects(
    t.mutation(
      internal.mutations.bot.discord.supportTickets.setRoutingThread.set,
      { ticketId, threadId: TARGET_ID }
    ),
    hasContract(disabledTickets)
  )
  assert.deepEqual(await snapshot(t), before)
})

test("runtime configuration suppresses stored enabled support and routing without erasing it", async () => {
  const t = convexTest({ schema, modules })
  const { guildId } = await seedManagedGuild(t)
  await seedSupportConfig(t, "explicit-messages")
  await t.run((ctx) =>
    ctx.db.insert("guildConfigs", {
      guildId,
      aiEnabled: false,
      moderationEnabled: true,
      welcomeEnabled: false,
      loggingEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    })
  )
  const before = await snapshot(t)
  const result = await t.query(
    internal.queries.bot.discord.guildConfigs.runtimeConfigByDiscordId.get,
    { discordGuildId: GUILD_ID }
  )
  assert.deepEqual(result, {
    status: "ready",
    config: {
      discordGuildId: GUILD_ID,
      moderationEnabled: true,
      welcomeEnabled: false,
      loggingEnabled: false,
      supportEnabled: false,
    },
  })
  assert.deepEqual(await snapshot(t), before)
})
async function seedManagedGuild(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "clerk-manager",
      email: "manager@example.com",
      role: "user",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    })
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId: GUILD_ID,
      name: "Test Guild",
      botJoinedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert("discordGuildMemberships", {
      guildId,
      userId,
      discordUserId: REQUESTER_ID,
      canManage: true,
      managementVerifiedAt: 1,
      managementVerificationSource: "discord-oauth",
      createdAt: 1,
      updatedAt: 1,
    })
    return { guildId, userId }
  })
}

async function seedSupportConfig(
  t: TestConvex<typeof schema>,
  transcriptPolicy: "metadata-only" | "explicit-messages"
) {
  await t.run(async (ctx) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_guild_id", (q) => q.eq("discordGuildId", GUILD_ID))
      .unique()
    assert.ok(guild)
    await ctx.db.insert("guildSupportConfigs", {
      guildId: guild._id,
      enabled: true,
      staffRoleIds: [ROLE_ID],
      targetId: TARGET_ID,
      targetType: "channel",
      transcriptPolicy,
      escalationPolicy: "jcn-product-only",
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

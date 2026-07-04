import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest, type TestConvex } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

process.env.DISCORD_BOT_CONVEX_SECRET = "test-bot-secret"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./actions/bot/discord/supportTickets/openOrResume.ts": () =>
    import("./actions/bot/discord/supportTickets/openOrResume"),
  "./mutations/bot/discord/supportTickets/openOrResume.ts": () =>
    import("./mutations/bot/discord/supportTickets/openOrResume"),
  "./mutations/dashboard/discord/guildSupportConfigs/update.ts": () =>
    import("./mutations/dashboard/discord/guildSupportConfigs/update"),
}

const GUILD_ID = "123456789012345678"
const REQUESTER_ID = "234567890123456789"
const TARGET_ID = "345678901234567890"
const ROLE_ID = "456789012345678901"

test("support config update authorizes, inserts, replaces, and audits", async () => {
  const t = convexTest({ schema, modules })
  const { guildId } = await seedManagedGuild(t)
  const args = {
    discordGuildId: GUILD_ID,
    enabled: true,
    staffRoleIds: [ROLE_ID],
    targetId: TARGET_ID,
    targetType: "channel" as const,
    transcriptPolicy: "explicit-messages" as const,
    escalationPolicy: "jcn-product-only" as const,
  }

  await assert.rejects(
    t.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      args
    )
  )

  const asManager = t.withIdentity({ subject: "clerk-manager" })
  const inserted = await asManager.mutation(
    api.mutations.dashboard.discord.guildSupportConfigs.update.update,
    args
  )
  const replaced = await asManager.mutation(
    api.mutations.dashboard.discord.guildSupportConfigs.update.update,
    {
      ...args,
      transcriptPolicy: "metadata-only",
      escalationPolicy: "none",
    }
  )

  assert.equal(replaced.supportConfigId, inserted.supportConfigId)
  assert.equal(replaced.transcriptPolicy, "metadata-only")
  const disabled = await asManager.mutation(
    api.mutations.dashboard.discord.guildSupportConfigs.update.update,
    {
      ...args,
      enabled: false,
      staffRoleIds: [],
      targetId: null,
    }
  )
  assert.equal(disabled.supportConfigId, inserted.supportConfigId)
  assert.equal(disabled.enabled, false)

  const stored = await t.run(async (ctx) => {
    const configs = await ctx.db.query("guildSupportConfigs").collect()
    const audits = await ctx.db
      .query("guildAuditEvents")
      .withIndex("by_guild_id_and_occurred_at", (q) => q.eq("guildId", guildId))
      .collect()
    return { configs, audits }
  })

  assert.equal(stored.configs.length, 1)
  assert.equal(stored.audits.length, 3)
  assert.ok(
    stored.audits.every(
      (audit) => audit.eventType === "dashboard.guild_support.updated"
    )
  )
})

test("support config update rejects incomplete routing and a departed bot", async () => {
  const t = convexTest({ schema, modules })
  const { guildId } = await seedManagedGuild(t)
  const asManager = t.withIdentity({ subject: "clerk-manager" })

  await assert.rejects(
    asManager.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      {
        discordGuildId: "999999999999999999",
        enabled: false,
        staffRoleIds: [],
        targetId: null,
        targetType: "channel",
        transcriptPolicy: "metadata-only",
        escalationPolicy: "none",
      }
    )
  )

  await assert.rejects(
    asManager.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      {
        discordGuildId: GUILD_ID,
        enabled: true,
        staffRoleIds: [],
        targetId: null,
        targetType: "channel",
        transcriptPolicy: "explicit-messages",
        escalationPolicy: "none",
      }
    )
  )
  await assert.rejects(
    asManager.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      {
        discordGuildId: GUILD_ID,
        enabled: true,
        staffRoleIds: [],
        targetId: TARGET_ID,
        targetType: "channel",
        transcriptPolicy: "explicit-messages",
        escalationPolicy: "none",
      }
    )
  )

  await t.run(async (ctx) => {
    await ctx.db.patch(guildId, { botLeftAt: Date.now() })
  })

  await assert.rejects(
    asManager.mutation(
      api.mutations.dashboard.discord.guildSupportConfigs.update.update,
      {
        discordGuildId: GUILD_ID,
        enabled: false,
        staffRoleIds: [],
        targetId: null,
        targetType: "channel",
        transcriptPolicy: "metadata-only",
        escalationPolicy: "none",
      }
    )
  )
})

test("ticket mutation opens, persists, links the requester, and resumes", async () => {
  const t = convexTest({ schema, modules })
  const { userId } = await seedManagedGuild(t)
  await seedSupportConfig(t, "explicit-messages")
  await t.run(async (ctx) => {
    await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId: REQUESTER_ID,
      scopes: [],
      createdAt: 1,
      updatedAt: 1,
    })
  })

  const input = {
    discordGuildId: GUILD_ID,
    requesterDiscordUserId: REQUESTER_ID,
    message: "I need help",
  }
  const opened = await t.mutation(
    internal.mutations.bot.discord.supportTickets.openOrResume.openOrResume,
    input
  )
  const resumed = await t.mutation(
    internal.mutations.bot.discord.supportTickets.openOrResume.openOrResume,
    input
  )

  assert.equal(opened.status, "opened")
  assert.equal(resumed.status, "resumed")
  assert.equal(resumed.ticketId, opened.ticketId)
  assert.equal(resumed.messageStored, true)
  assert.deepEqual(resumed.route, {
    targetId: TARGET_ID,
    targetType: "channel",
    staffRoleIds: [ROLE_ID],
  })

  const stored = await t.run(async (ctx) => ({
    ticket: await ctx.db.get(opened.ticketId),
    messages: await ctx.db
      .query("supportTicketMessages")
      .withIndex("by_ticket_id_and_created_at", (q) =>
        q.eq("ticketId", opened.ticketId)
      )
      .collect(),
  }))

  assert.equal(stored.ticket?.requesterUserId, userId)
  assert.equal(stored.ticket?.openCount, 2)
  assert.equal(stored.messages.length, 2)
})

test("ticket mutation enforces transcript policy and unavailable guild paths", async () => {
  const t = convexTest({ schema, modules })
  const { guildId } = await seedManagedGuild(t)
  const input = {
    discordGuildId: GUILD_ID,
    requesterDiscordUserId: REQUESTER_ID,
    message: "Do not persist this",
  }

  const missingConfig = await t.mutation(
    internal.mutations.bot.discord.supportTickets.openOrResume.openOrResume,
    input
  )
  assert.deepEqual(missingConfig, {
    status: "guildSupportUnavailable",
    reason: "notConfigured",
  })

  await seedSupportConfig(t, "metadata-only")
  const opened = await t.mutation(
    internal.mutations.bot.discord.supportTickets.openOrResume.openOrResume,
    input
  )
  assert.equal(opened.status, "opened")
  assert.equal(opened.messageStored, false)

  await t.run(async (ctx) => {
    await ctx.db.patch(guildId, { botLeftAt: Date.now() })
  })
  const botLeft = await t.mutation(
    internal.mutations.bot.discord.supportTickets.openOrResume.openOrResume,
    {
      ...input,
      requesterDiscordUserId: "567890123456789012",
    }
  )
  assert.deepEqual(botLeft, {
    status: "guildSupportUnavailable",
    reason: "notConfigured",
  })
})

test("ticket action validates the bot secret and executes the mutation", async () => {
  const t = convexTest({ schema, modules })

  await assert.rejects(
    t.action(api.actions.bot.discord.supportTickets.openOrResume.openOrResume, {
      secret: "wrong",
      input: { requesterDiscordUserId: REQUESTER_ID },
    })
  )

  const result = await t.action(
    api.actions.bot.discord.supportTickets.openOrResume.openOrResume,
    {
      secret: "test-bot-secret",
      input: {
        requesterDiscordUserId: REQUESTER_ID,
      },
    }
  )

  assert.equal(result.status, "opened")
  assert.equal(result.scope, "jcn")
  assert.equal(result.messageStored, false)
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

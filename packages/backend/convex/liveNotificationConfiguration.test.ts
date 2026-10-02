import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { api } from "./_generated/api"

test("missing Twitch Client ID returns safe server configuration status without provider lookup", async (t) => {
  const keys = [
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "TWITCH_BOT_USER_ID",
    "TWITCH_EVENTSUB_CALLBACK_URL",
    "TWITCH_EVENTSUB_SECRET",
    "TWITCH_WORKER_SECRET",
  ] as const
  const previous = keys.map((key) => [key, process.env[key]] as const)
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  delete process.env.TWITCH_CLIENT_ID
  process.env.TWITCH_CLIENT_SECRET = randomUUID()
  process.env.TWITCH_BOT_USER_ID = "111"
  process.env.TWITCH_EVENTSUB_CALLBACK_URL = "https://test.example/eventsub"
  process.env.TWITCH_EVENTSUB_SECRET = randomUUID()
  process.env.TWITCH_WORKER_SECRET = randomUUID()
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Missing server configuration must not trigger provider lookup")
  })
  const modules = {
    "./_generated/server.js": () => import("./_generated/server.js"),
    "./liveNotifications.ts": () => import("./liveNotifications"),
    "./liveNotificationActions.ts": () => import("./liveNotificationActions"),
  }
  const backend = convexTest({ schema, modules })
  const discordGuildId = "123456789012345678"
  await backend.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "owner",
      email: "owner@example.com",
      role: "user",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    })
    const ownerDiscordId = "234567890123456789"
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId,
      ownerDiscordId,
      name: "Test server",
      createdAt: 1,
      updatedAt: 1,
    })
    for (const provider of ["discord", "twitch"] as const)
      await ctx.db.insert("linkedAccounts", {
        userId,
        provider,
        providerAccountId: provider === "discord" ? ownerDiscordId : "222",
        scopes: ["channel:bot"],
        createdAt: 1,
        updatedAt: 1,
      })
    await ctx.db.insert("discordGuildMemberships", {
      guildId,
      userId,
      discordUserId: ownerDiscordId,
      canManage: true,
      managementVerifiedAt: Date.now(),
      createdAt: 1,
      updatedAt: 1,
    })
  })
  const view = await backend
    .withIdentity({ subject: "owner" })
    .action(api.liveNotificationActions.get, { discordGuildId })
  assert.deepEqual(view.source, { status: "configurationUnavailable" })
  assert.equal(view.isOwner, true)
  const { controlPlaneConfig } = await import("./twitchEventSubActions")
  assert.throws(controlPlaneConfig, /server configuration is unavailable/)
  const { readTwitchControlPlaneConfig } =
    await import("./lib/twitchControlPlaneConfig")
  const available = {
    TWITCH_CLIENT_ID: "test-client",
    TWITCH_CLIENT_SECRET: randomUUID(),
    TWITCH_BOT_USER_ID: "111",
    TWITCH_EVENTSUB_CALLBACK_URL: "https://test.example/eventsub",
    TWITCH_EVENTSUB_SECRET: randomUUID(),
    TWITCH_WORKER_SECRET: randomUUID(),
  }
  assert.deepEqual(readTwitchControlPlaneConfig(available), {
    clientId: available.TWITCH_CLIENT_ID,
    clientSecret: available.TWITCH_CLIENT_SECRET,
    botId: available.TWITCH_BOT_USER_ID,
    callback: available.TWITCH_EVENTSUB_CALLBACK_URL,
    secret: available.TWITCH_EVENTSUB_SECRET,
  })
  for (const key of keys) {
    for (const value of [
      undefined,
      "",
      " ",
      ` ${available[key]}`,
      `${available[key]} `,
      `\t${available[key]}\n`,
    ])
      assert.equal(
        readTwitchControlPlaneConfig({ ...available, [key]: value }),
        null,
        `${key} must reject missing, empty and whitespace-padded configuration`
      )
  }
})

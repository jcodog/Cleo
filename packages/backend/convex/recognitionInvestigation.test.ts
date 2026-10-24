import assert from "node:assert/strict"
import { test } from "node:test"
import { convexTest } from "convex-test"
import schema from "./schema"
import { internal } from "./_generated/api"

process.env.CLEO_RECOGNITION_ENABLED = "false"
process.env.DISCORD_BOT_TOKEN = "fixture-bot"
process.env.CLEO_OFFICIAL_GUILD_ID = "999999999999999999"
process.env.CLEO_COMMUNITY_UPGRADES_CHANNEL_ID = "888888888888888888"

const modules = {
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./communityRecognition.ts": () => import("./communityRecognition"),
  "./recognitionActions.ts": () => import("./recognitionActions"),
}

test("operators verify existing investigation messages with delivery disabled, never sending or trusting unrelated messages", async (t) => {
  const f = convexTest(schema, modules)
  const key = "private-recognition-key"
  const id = await f.run(async (ctx) => {
    const now = Date.now()
    const userId = await ctx.db.insert("users", {
      clerkUserId: "alice",
      email: "private@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    const guildId = await ctx.db.insert("guilds", {
      discordGuildId: "333333333333333333",
      name: "Private community",
      createdAt: now,
      updatedAt: now,
    })
    const activationId = await ctx.db.insert("paidCommunityActivations", {
      subscriptionId: "sub_private",
      guildId,
      userId,
      discordUserId: "111111111111111111",
      purchaserKind: "owner",
      announce: true,
      displayRole: false,
      paidUntil: now + 3600000,
      revoked: false,
      firstPaidInvoiceId: "in_private",
      updatedAt: now,
      testMode: false,
    })
    return ctx.db.insert("communityAnnouncementOutbox", {
      activationId,
      key,
      state: "investigation",
      updatedAt: now,
    })
  })
  const { digestIntegrationValue } = await import("./lib/integrationSecurity")
  const messageId = "444444444444444444"
  let outcome = "valid",
    requests = 0
  const warnings: string[] = []
  t.mock.method(console, "warn", (line: string) => warnings.push(line))
  const previous = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    requests++
    assert.notEqual(init?.method, "POST")
    if (outcome === "network") throw new Error("provider unavailable")
    if (String(input).endsWith("/users/@me"))
      return Response.json({ id: "bot", bot: true })
    if (String(input).endsWith(`/messages/${messageId}`))
      return Response.json({
        id: outcome === "wrong-id" ? "555555555555555555" : messageId,
        author: { id: outcome === "human" ? "human" : "bot" },
        embeds: [
          {
            footer: {
              text:
                outcome === "wrong-footer"
                  ? "unrelated"
                  : `Cleo recognition ${digestIntegrationValue(key).slice(0, 24)}`,
            },
          },
        ],
      })
    return Response.json({
      guild_id:
        outcome === "wrong-channel"
          ? "external"
          : process.env.CLEO_OFFICIAL_GUILD_ID,
    })
  }
  t.after(() => {
    globalThis.fetch = previous
  })
  await f.action(internal.recognitionActions.deliver, {})
  await f.action(internal.recognitionActions.reconcile, {})
  assert.equal(requests, 0)
  await assert.rejects(
    f.action(internal.recognitionActions.reconcile, { investigationId: id }),
    /required/
  )
  await assert.rejects(
    f.action(internal.recognitionActions.reconcile, { messageId }),
    /required/
  )
  await assert.rejects(
    f.action(internal.recognitionActions.reconcile, {
      investigationId: id,
      messageId: "../other-channel",
    }),
    /required/
  )
  for (outcome of [
    "network",
    "wrong-channel",
    "human",
    "wrong-footer",
    "wrong-id",
  ]) {
    await assert.rejects(
      f.action(internal.recognitionActions.reconcile, {
        investigationId: id,
        messageId,
      }),
      /unavailable|official server|could not be verified/
    )
    assert.equal((await f.run((ctx) => ctx.db.get(id)))?.state, "investigation")
  }
  outcome = "valid"
  await f.action(internal.recognitionActions.reconcile, {
    investigationId: id,
    messageId,
  })
  assert.equal((await f.run((ctx) => ctx.db.get(id)))?.state, "sent")
  assert.equal((await f.run((ctx) => ctx.db.get(id)))?.messageId, messageId)
  const finishedRequests = requests
  await f.action(internal.recognitionActions.reconcile, {
    investigationId: id,
    messageId,
  })
  assert.equal(requests, finishedRequests)
  assert.equal(
    (await f.query(internal.communityRecognition.investigations, {})).count,
    0
  )
  assert.deepEqual(warnings, [])
})

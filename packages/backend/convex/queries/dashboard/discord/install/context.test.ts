import assert from "node:assert/strict"
import { test } from "node:test"

import { convexTest } from "convex-test"

import { internal } from "../../../../_generated/api"
import schema from "../../../../schema"

const modules = {
  "./_generated/server.js": () => import("../../../../_generated/server.js"),

  "./queries/dashboard/discord/install/context.ts": () => import("./context"),
}

test("allows a first-time install when the Discord guild is not yet stored", async () => {
  const t = convexTest({ schema, modules })
  const now = Date.now()
  const clerkUserId = "clerk_test_user"
  const discordUserId = "223456789012345678"
  const discordGuildId = "123456789012345678"

  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId,
      email: "test@example.com",
      role: "user",
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId: discordUserId,
      scopes: ["identify", "guilds"],
      createdAt: now,
      updatedAt: now,
    })
  })

  const result = await t
    .withIdentity({
      subject: clerkUserId,
    })
    .query(
      internal.queries.dashboard.discord.install.context
        .getCreateServerInstallContext,
      {
        discordGuildId,
      }
    )

  if (result.status !== "ready") {
    assert.fail(`Expected ready, received ${result.status}`)
  }

  assert.equal(result.discordGuildId, discordGuildId)
})

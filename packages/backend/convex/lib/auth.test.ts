import assert from "node:assert/strict"
import { test } from "node:test"
import { ConvexError } from "convex/values"
import { convexTest, type TestConvex } from "convex-test"

import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import {
  requireAdmin,
  requireCurrentUser,
  requireDiscordGuildManager,
  requireStaff,
} from "./auth"

type Role = "user" | "staff" | "admin" | "superadmin"
const modules = {
  "./_generated/server.js": () => import("../_generated/server.js"),
}

test("current-user authorization rejects unauthenticated and disabled users", async () => {
  const t = convexTest({ schema, modules })

  await assertConvexError(
    t.run(async (ctx) => await requireCurrentUser(ctx)),
    "UNAUTHORIZED"
  )
  await assertConvexError(
    t
      .withIdentity({ subject: "missing-user" })
      .run(async (ctx) => await requireCurrentUser(ctx)),
    "UNAUTHORIZED"
  )

  await seedUser(t, "disabled-user", "user", "disabled")
  await assertConvexError(
    t
      .withIdentity({ subject: "disabled-user" })
      .run(async (ctx) => await requireCurrentUser(ctx)),
    "USER_DISABLED"
  )
})

test("staff and admin authorization enforce the role hierarchy", async () => {
  const t = convexTest({ schema, modules })
  const roles: Role[] = ["user", "staff", "admin", "superadmin"]

  for (const role of roles) {
    await seedUser(t, `role-${role}`, role)
  }

  for (const role of roles) {
    const asRole = t.withIdentity({ subject: `role-${role}` })

    if (role === "user") {
      await assertConvexError(
        asRole.run(async (ctx) => await requireStaff(ctx)),
        "FORBIDDEN"
      )
    } else {
      const user = await asRole.run(async (ctx) => await requireStaff(ctx))
      assert.equal(user.role, role)
    }

    if (role === "admin" || role === "superadmin") {
      const user = await asRole.run(async (ctx) => await requireAdmin(ctx))
      assert.equal(user.role, role)
    } else {
      await assertConvexError(
        asRole.run(async (ctx) => await requireAdmin(ctx)),
        "FORBIDDEN"
      )
    }
  }
})

test("guild management accepts only a current direct verified membership", async () => {
  const t = convexTest({ schema, modules })
  const userId = await seedUser(t, "direct-manager", "user")
  const asManager = t.withIdentity({ subject: "direct-manager" })

  const validGuildId = await seedGuild(t, "direct-valid")
  const validMembershipId = await seedMembership(t, {
    guildId: validGuildId,
    userId,
    discordUserId: "discord-direct-valid",
    canManage: true,
    managementVerifiedAt: 1,
  })
  const valid = await asManager.run(
    async (ctx) => await requireDiscordGuildManager(ctx, validGuildId)
  )
  assert.equal(valid._id, validMembershipId)

  const rejectedMemberships = [
    { suffix: "cannot-manage", canManage: false, managementVerifiedAt: 1 },
    { suffix: "unverified", canManage: true },
    {
      suffix: "revoked",
      canManage: true,
      managementVerifiedAt: 1,
      revokedAt: 2,
    },
  ]

  for (const { suffix, ...membership } of rejectedMemberships) {
    const guildId = await seedGuild(t, suffix)
    await seedMembership(t, {
      guildId,
      userId,
      discordUserId: `discord-${suffix}`,
      ...membership,
    })
    await assertConvexError(
      asManager.run(
        async (ctx) => await requireDiscordGuildManager(ctx, guildId)
      ),
      "FORBIDDEN"
    )
  }
})

test("guild management falls back through a linked Discord account", async () => {
  const t = convexTest({ schema, modules })
  const missingDiscordUserId = await seedUser(t, "no-discord", "user")
  const missingDiscordGuildId = await seedGuild(t, "no-discord")
  await t.run(async (ctx) => {
    await ctx.db.insert("linkedAccounts", {
      userId: missingDiscordUserId,
      provider: "kick",
      providerAccountId: "kick-user",
      scopes: [],
      createdAt: 1,
      updatedAt: 1,
    })
  })
  await assertConvexError(
    t
      .withIdentity({ subject: "no-discord" })
      .run(
        async (ctx) =>
          await requireDiscordGuildManager(ctx, missingDiscordGuildId)
      ),
    "FORBIDDEN"
  )

  const linkedUserId = await seedUser(t, "linked-manager", "user")
  await seedDiscordAccount(t, linkedUserId, "discord-linked")
  const deniedGuildId = await seedGuild(t, "linked-denied")
  await seedMembership(t, {
    guildId: deniedGuildId,
    discordUserId: "discord-linked",
    canManage: false,
    managementVerifiedAt: 1,
  })
  const asLinkedManager = t.withIdentity({ subject: "linked-manager" })
  await assertConvexError(
    asLinkedManager.run(
      async (ctx) => await requireDiscordGuildManager(ctx, deniedGuildId)
    ),
    "FORBIDDEN"
  )

  const allowedGuildId = await seedGuild(t, "linked-allowed")
  const membershipId = await seedMembership(t, {
    guildId: allowedGuildId,
    discordUserId: "discord-linked",
    canManage: true,
    managementVerifiedAt: 1,
  })
  const membership = await asLinkedManager.run(
    async (ctx) => await requireDiscordGuildManager(ctx, allowedGuildId)
  )
  assert.equal(membership._id, membershipId)
})

async function assertConvexError(
  promise: Promise<unknown>,
  code: "UNAUTHORIZED" | "USER_DISABLED" | "FORBIDDEN"
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ConvexError)
    assert.equal(error.data.code, code)
    return true
  })
}

async function seedUser(
  t: TestConvex<typeof schema>,
  clerkUserId: string,
  role: Role,
  status: "active" | "disabled" = "active"
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        clerkUserId,
        email: `${clerkUserId}@example.com`,
        role,
        status,
        createdAt: 1,
        updatedAt: 1,
      })
  )
}

async function seedGuild(t: TestConvex<typeof schema>, suffix: string) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("guilds", {
        discordGuildId: `guild-${suffix}`,
        name: `Guild ${suffix}`,
        createdAt: 1,
        updatedAt: 1,
      })
  )
}

async function seedDiscordAccount(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  providerAccountId: string
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("linkedAccounts", {
      userId,
      provider: "discord",
      providerAccountId,
      scopes: [],
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

async function seedMembership(
  t: TestConvex<typeof schema>,
  membership: {
    guildId: Id<"guilds">
    userId?: Id<"users">
    discordUserId: string
    canManage: boolean
    managementVerifiedAt?: number
    revokedAt?: number
  }
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("discordGuildMemberships", {
        ...membership,
        createdAt: 1,
        updatedAt: 1,
      })
  )
}

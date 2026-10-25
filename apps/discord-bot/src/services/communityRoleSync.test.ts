import assert from "node:assert/strict"
import { test, type TestContext } from "node:test"
import { Client, PermissionFlagsBits, PermissionsBitField } from "discord.js"
import { ConvexHttpClient } from "convex/browser"
import { getFunctionName } from "convex/server"
import type { Id } from "@workspace/backend/convex/_generated/dataModel.js"
import { resolveCleoRoleEligibility } from "@workspace/shared/cleoRoleEligibility"

const officialGuildId = "999999999999999999"
const roleId = "555555555555555555"
process.env.CLEO_OFFICIAL_GUILD_ID = officialGuildId
process.env.CLEO_COMMUNITY_ROLES_ENABLED = "true"
process.env.CONVEX_URL = "https://fixture.convex.cloud"
process.env.DISCORD_BOT_CONVEX_SECRET = "fixture-bot-secret"

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

async function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ["setInterval"] })
  t.mock.method(console, "log", () => undefined)
  t.mock.method(console, "error", () => undefined)
  const { configureCommunityRoleSync } = await import("./communityRoleSync")
  const { shutdownDiscordBot } = await import("../runtime/shutdown")
  const client = new Client<true>({ intents: [] })
  const previousExitCode = process.exitCode
  t.after(async () => {
    await flush()
    await shutdownDiscordBot({
      client,
      reason: "SIGTERM",
      exitCode: 0,
      exit: () => {},
    })
    process.exitCode = previousExitCode
    t.mock.timers.reset()
  })
  const hooks: {
    claim?: () => void
    roles?: () => void
    member?: () => void
    settle?: () => void
    validate?: () => boolean
  } = {}
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const changes: string[] = []
  const jobs = [1, 2].map((index) => ({
    id: `job-${index}` as Id<"communityRoleJobs">,
    discordUserId: `11111111111111111${index}`,
    revision: index,
    leaseUntil: Date.now() + 60000,
    eligibility: resolveCleoRoleEligibility({
      now: Date.now(),
      verifiedAccount: true,
      officialGuildId,
      communities: [],
      twitchActive: false,
      paidSupporter: false,
    }),
  }))
  const roles = new Map([
    [
      roleId,
      {
        permissions: new PermissionsBitField(),
        managed: false,
        editable: true,
      },
    ],
  ])
  const member = {
    roles: {
      cache: new Map<string, unknown>(),
      add: async (id: string) => {
        changes.push(`add:${id}`)
      },
      remove: async (id: string) => {
        changes.push(`remove:${id}`)
      },
    },
  }
  const guild = {
    available: true,
    roles: {
      fetch: t.mock.fn(async () => {
        hooks.roles?.()
        return roles
      }),
    },
    members: {
      me: {
        permissions: new PermissionsBitField(PermissionFlagsBits.ManageRoles),
      },
      fetch: t.mock.fn(async () => {
        hooks.member?.()
        return member
      }),
    },
  }
  const installGuild = () =>
    client.guilds.cache.set(officialGuildId, guild as never)
  t.mock.method(
    ConvexHttpClient.prototype,
    "action",
    async (
      reference: Parameters<typeof getFunctionName>[0],
      args: Record<string, unknown>
    ) => {
      const name = getFunctionName(reference)
      calls.push({ name, args })
      if (name === "communityRuntime:validateJob")
        return hooks.validate?.() ?? true
      if (name === "communityRuntime:claimJobs") {
        hooks.claim?.()
        return {
          guildId: officialGuildId,
          roleIdsJSON: JSON.stringify({ member: roleId }),
          jobs,
        }
      }
      assert.equal(name, "communityRuntime:settleJob")
      hooks.settle?.()
      return null
    }
  )
  function assertSettled(successes: boolean[]) {
    const claimed = calls.find(
      (call) => call.name === "communityRuntime:claimJobs"
    )
    assert.ok(claimed)
    assert.equal(typeof claimed.args.worker, "string")
    assert.deepEqual(
      calls
        .filter((call) => call.name === "communityRuntime:settleJob")
        .map((call) => call.args),
      jobs.map((job, index) => ({
        secret: "fixture-bot-secret",
        worker: claimed.args.worker,
        id: job.id,
        revision: job.revision,
        success: successes[index],
      }))
    )
  }
  return {
    client,
    guild,
    hooks,
    jobs,
    calls,
    changes,
    installGuild,
    assertSettled,
    start: () => configureCommunityRoleSync(client),
  }
}

test("non-owning shards never claim community role jobs on startup or timer ticks", async (t) => {
  const f = await fixture(t)
  const otherGuildId = "333333333333333333"
  f.client.guilds.cache.set(otherGuildId, {
    ...f.guild,
    id: otherGuildId,
  } as never)
  f.start()
  t.mock.timers.tick(30000)
  await flush()
  assert.deepEqual(f.calls, [])
  assert.deepEqual(f.changes, [])
})

test("an owning shard waits for guild availability and resumes on a later tick", async (t) => {
  const f = await fixture(t)
  f.installGuild()
  f.guild.available = false
  f.start()
  t.mock.timers.tick(15000)
  await flush()
  assert.deepEqual(f.calls, [])
  f.guild.available = true
  t.mock.timers.tick(15000)
  await flush()
  f.assertSettled([true, true])
  assert.deepEqual(f.changes, [`add:${roleId}`, `add:${roleId}`])
})

test("a refresh invalidating dispatched authority prevents external role changes", async (t) => {
  const f = await fixture(t)
  f.installGuild()
  f.hooks.validate = () => false
  f.start()
  await flush()
  f.assertSettled([false, false])
  assert.deepEqual(f.changes, [])
  assert.equal(
    f.calls.filter((call) => call.name === "communityRuntime:validateJob")
      .length,
    2
  )
})

for (const unavailable of ["removed", "unavailable"] as const)
  test(`guild ${unavailable} after claiming releases every job as failed`, async (t) => {
    const f = await fixture(t)
    f.installGuild()
    f.hooks.claim = () => {
      if (unavailable === "removed")
        f.client.guilds.cache.delete(officialGuildId)
      else f.guild.available = false
    }
    f.start()
    await flush()
    f.assertSettled([false, false])
    assert.equal(f.guild.roles.fetch.mock.callCount(), 0)
    assert.equal(f.guild.members.fetch.mock.callCount(), 0)
    assert.deepEqual(f.changes, [])
    t.mock.timers.tick(15000)
    await flush()
    assert.equal(
      f.calls.filter((call) => call.name === "communityRuntime:claimJobs")
        .length,
      1
    )
    delete f.hooks.claim
    f.guild.available = true
    f.installGuild()
    t.mock.timers.tick(15000)
    await flush()
    assert.equal(
      f.calls.filter((call) => call.name === "communityRuntime:claimJobs")
        .length,
      2
    )
    assert.equal(
      f.calls.filter((call) => call.name === "communityRuntime:settleJob")
        .length,
      4
    )
  })

test("guild loss during member fetch cannot change roles and settles remaining jobs", async (t) => {
  const f = await fixture(t)
  f.installGuild()
  f.hooks.member = () => {
    f.guild.available = false
  }
  f.start()
  await flush()
  f.assertSettled([false, false])
  assert.equal(f.guild.members.fetch.mock.callCount(), 1)
  assert.deepEqual(f.changes, [])
})

test("role fetch failures and late leases release jobs without modifying roles", async (t) => {
  const f = await fixture(t)
  f.installGuild()
  f.hooks.roles = () => {
    throw new Error("guild role fetch unavailable")
  }
  f.start()
  await flush()
  f.assertSettled([false, false])
  assert.deepEqual(f.changes, [])
  delete f.hooks.roles
  f.calls.length = 0
  for (const job of f.jobs) job.leaseUntil = Date.now() + 5000
  t.mock.timers.tick(15000)
  await flush()
  f.assertSettled([false, false])
  assert.equal(f.guild.members.fetch.mock.callCount(), 0)
})

test("a failed release does not prevent attempts to settle the rest of the batch", async (t) => {
  const f = await fixture(t)
  f.installGuild()
  f.hooks.claim = () => {
    f.guild.available = false
  }
  f.hooks.settle = () => {
    throw new Error("backend unavailable")
  }
  f.start()
  await flush()
  f.assertSettled([false, false])
  assert.deepEqual(f.changes, [])
})

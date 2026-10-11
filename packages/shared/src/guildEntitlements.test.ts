import assert from "node:assert/strict"
import { test } from "node:test"
import {
  resolveCleoGuildAccess,
  GUILD_BILLING_MAX_FRESHNESS_MS,
  type CleoGuildAccessRecord,
  type CleoGuildSubscriptionStatus,
} from "./cleoEntitlements"

const now = 10 * GUILD_BILLING_MAX_FRESHNESS_MS
const subscription: CleoGuildAccessRecord = {
  kind: "subscription",
  discordGuildId: "guild-a",
  startsAt: now - 1000,
  endsAt: now + 1000,
  status: "active",
  reconciledAt: now,
}
const grant: CleoGuildAccessRecord = {
  kind: "grant",
  category: "test",
  discordGuildId: "guild-a",
  startsAt: now - 1000,
  endsAt: now + 5000,
  capabilities: ["guild.welcome.premium-style"],
}
const resolve = (records: CleoGuildAccessRecord[], time = now) =>
  resolveCleoGuildAccess({ discordGuildId: "guild-a", now: time, records })

test("guild capabilities are isolated and grants never imply Twitch or manager permissions", () => {
  assert.deepEqual(resolve([]), {
    capabilities: [],
    capabilityDeadlines: {},
    state: "expired",
    validUntil: now,
  })
  assert.deepEqual(
    resolve([{ ...subscription, discordGuildId: "guild-b" }]).capabilities,
    []
  )
  assert.deepEqual(resolve([grant]).capabilities, [
    "guild.welcome.premium-style",
  ])
  assert.deepEqual(resolve([subscription]).capabilities, [
    "guild.twitch.premium-style",
    "guild.welcome.premium-style",
  ])
  assert.equal(resolve([subscription, grant]).validUntil, now + 1000)
  assert.equal(
    resolve([{ ...grant, revokedAt: now }, subscription]).state,
    "active"
  )
  assert.equal(
    resolve([subscription, { ...grant, revokedAt: now }]).state,
    "active"
  )
  assert.equal(resolve([{ ...grant, capabilities: [] }]).state, "expired")
  assert.equal(resolve([{ ...grant, revokedAt: now }]).state, "revoked")
  assert.equal(resolve([grant], now + 5000).state, "expired")
})

test("invalid, future, expired and stale lifecycle data fail closed", () => {
  for (const patch of [
    { startsAt: NaN },
    { endsAt: Infinity },
    { startsAt: -1 },
    { startsAt: now + 1 },
    { endsAt: subscription.startsAt },
    { endsAt: now },
    { reconciledAt: NaN },
    { reconciledAt: now + 1 },
    { reconciledAt: subscription.startsAt - 1 },
    { startsAt: 0, reconciledAt: now - GUILD_BILLING_MAX_FRESHNESS_MS },
    { status: "trialing" as const },
    { status: "trialing" as const, trialEndsAt: NaN },
    { status: "trialing" as const, trialEndsAt: now },
    { status: "trialing" as const, trialEndsAt: subscription.startsAt },
    { status: "trialing" as const, trialEndsAt: subscription.endsAt + 1 },
    { status: "past_due" as const },
    { status: "past_due" as const, paymentFailedAt: NaN },
    { status: "past_due" as const, paymentFailedAt: now + 1 },
    { status: "past_due" as const, paymentFailedAt: subscription.startsAt - 1 },
    { status: "past_due" as const, paymentFailedAt: now },
    { status: "past_due" as const, paymentFailedAt: now, graceEndsAt: NaN },
    { status: "past_due" as const, paymentFailedAt: now - 1, graceEndsAt: now },
  ])
    assert.deepEqual(resolve([{ ...subscription, ...patch }]).capabilities, [])
  assert.deepEqual(resolve([subscription], NaN).capabilities, [])
  for (const status of [
    "canceled",
    "unpaid",
    "paused",
    "expired",
    "revoked",
    "incomplete",
    "incomplete_expired",
  ] satisfies CleoGuildSubscriptionStatus[]) {
    assert.deepEqual(resolve([{ ...subscription, status }]).capabilities, [])
  }
})

test("trial and grace have bounded deadlines and grace can outlive the paid period", () => {
  const trial = resolve([
    { ...subscription, status: "trialing", trialEndsAt: now + 100 },
  ])
  assert.equal(trial.state, "trial")
  assert.equal(trial.validUntil, now + 100)
  const graceRecord: CleoGuildAccessRecord = {
    ...subscription,
    status: "past_due",
    endsAt: now - 1,
    paymentFailedAt: now - 10,
    graceEndsAt: now + 200,
  }
  const grace = resolve([graceRecord])
  assert.equal(grace.state, "grace")
  assert.equal(grace.validUntil, now + 200)
  assert.deepEqual(resolve([graceRecord], now + 200).capabilities, [])
  assert.equal(
    resolve([
      {
        ...subscription,
        status: "past_due",
        paymentFailedAt: now,
        graceEndsAt: now + 100 * 86400000,
      },
    ]).validUntil,
    now + GUILD_BILLING_MAX_FRESHNESS_MS
  )
})

test("overlapping sources use deterministic precedence and independent capability deadlines", () => {
  const trial: CleoGuildAccessRecord = {
    ...subscription,
    status: "trialing",
    trialEndsAt: now + 500,
  }
  const grace: CleoGuildAccessRecord = {
    ...subscription,
    status: "past_due",
    paymentFailedAt: now,
    graceEndsAt: now + 3000,
  }
  const twitch: CleoGuildAccessRecord = {
    ...grant,
    capabilities: ["guild.twitch.premium-style"],
    endsAt: now + 50,
  }
  const inputs = [subscription, trial, grace, grant, twitch]
  const expected = resolve(inputs)
  for (let i = 0; i < inputs.length; i++) {
    assert.deepEqual(
      resolve([...inputs.slice(i), ...inputs.slice(0, i)]),
      expected
    )
    assert.deepEqual(resolve([...inputs].reverse()), expected)
  }
  assert.equal(expected.state, "active")
  assert.deepEqual(expected.capabilityDeadlines, {
    "guild.welcome.premium-style": now + 5000,
    "guild.twitch.premium-style": now + 3000,
  })
  assert.equal(expected.validUntil, now + 3000)
  assert.equal(resolve([trial, grace]).state, "trial")
  assert.equal(resolve([grace, trial]).state, "trial")
  assert.equal(
    resolve([grant, twitch]).capabilityDeadlines["guild.welcome.premium-style"],
    now + 5000
  )
  assert.deepEqual(resolve([grant, twitch], now + 50).capabilities, [
    "guild.welcome.premium-style",
  ])
  assert.equal(resolve([grace], now + 3000).state, "expired")
})

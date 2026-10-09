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

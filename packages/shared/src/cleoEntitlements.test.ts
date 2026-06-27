import assert from "node:assert/strict"
import { test } from "node:test"

import {
  hasCleoPetCapability,
  isCleoPublicProfilePayloadSafe,
  resolveCleoPetAccess,
  type CleoEntitlementRecord,
} from "./cleoEntitlements"

const now = 1_800_000_000_000
const userId = "user-1"
const guildId = "guild-1"

function entitlement(
  overrides: Partial<CleoEntitlementRecord> = {}
): CleoEntitlementRecord {
  return {
    entitlementId: "entitlement-1",
    category: "user-subscription",
    source: "stripe",
    subjectType: "user",
    subjectId: userId,
    status: "active",
    benefit: {
      kind: "bundle",
      bundle: "user-subscription",
    },
    ...overrides,
  }
}

function resolve(entitlements: CleoEntitlementRecord[] = []) {
  return resolveCleoPetAccess({
    userId,
    guildId,
    now,
    environment: "production",
    entitlements,
  })
}

test("free access includes a meaningful fair game loop", () => {
  const access = resolve()

  assert.equal(hasCleoPetCapability(access, "pets.adopt-starter"), true)
  assert.equal(hasCleoPetCapability(access, "pets.basic-progression"), true)
  assert.equal(hasCleoPetCapability(access, "battles.unranked"), true)
  assert.equal(hasCleoPetCapability(access, "battles.ranked-access"), true)
  assert.equal(hasCleoPetCapability(access, "profiles.basic-card"), true)
  assert.equal(hasCleoPetCapability(access, "pets.extra-slots"), false)
  assert.deepEqual(access.limits, {
    petSlots: 1,
    cardLayouts: 1,
    dailyUnrankedEnergy: 5,
    maxBankedUnrankedEnergy: 25,
    maxBankedEventEntries: 10,
  })
})

test("user subscription adds expression and unranked convenience only", () => {
  const access = resolve([entitlement()])

  assert.equal(hasCleoPetCapability(access, "pets.extra-slots"), true)
  assert.equal(hasCleoPetCapability(access, "profiles.premium-themes"), true)
  assert.equal(hasCleoPetCapability(access, "cards.premium-frames"), true)
  assert.equal(hasCleoPetCapability(access, "profiles.titles"), true)
  assert.equal(
    hasCleoPetCapability(access, "battles.bonus-unranked-energy"),
    true
  )
  assert.equal(access.limits.petSlots, 3)
  assert.equal(access.limits.cardLayouts, 3)
  assert.equal(access.limits.dailyUnrankedEnergy, 10)
  assert.equal(
    access.capabilities.some((capability) => capability.includes("power")),
    false
  )
})

test("guild subscription affects guild events without changing user power", () => {
  const access = resolve([
    entitlement({
      entitlementId: "guild-subscription",
      category: "guild-subscription",
      source: "discord",
      subjectType: "guild",
      subjectId: guildId,
      benefit: {
        kind: "bundle",
        bundle: "guild-subscription",
      },
    }),
  ])

  assert.equal(hasCleoPetCapability(access, "guilds.tournaments"), true)
  assert.equal(hasCleoPetCapability(access, "guilds.events"), true)
  assert.equal(hasCleoPetCapability(access, "pets.extra-slots"), false)
  assert.equal(access.limits.dailyUnrankedEnergy, 5)
})

test("durable cosmetics and consumables resolve independently with hard caps", () => {
  const access = resolve([
    entitlement({
      entitlementId: "frame",
      category: "durable-one-time-purchase",
      source: "discord",
      benefit: {
        kind: "durable-cosmetic",
        cosmeticType: "card-frame",
        assetKey: "cyan-circuit",
      },
    }),
    entitlement({
      entitlementId: "energy-a",
      category: "consumable-one-time-purchase",
      benefit: {
        kind: "consumable",
        consumableType: "unranked-energy",
        quantity: 20,
      },
    }),
    entitlement({
      entitlementId: "energy-b",
      category: "consumable-one-time-purchase",
      benefit: {
        kind: "consumable",
        consumableType: "unranked-energy",
        quantity: 20,
      },
    }),
    entitlement({
      entitlementId: "entries",
      category: "consumable-one-time-purchase",
      benefit: {
        kind: "consumable",
        consumableType: "event-entry",
        quantity: 12,
      },
    }),
  ])

  assert.deepEqual(access.durableCosmeticKeys, ["card-frame:cyan-circuit"])
  assert.deepEqual(access.consumables, {
    unrankedEnergy: 25,
    eventEntries: 10,
  })
})

test("inactive, mismatched, malformed, and production test grants fail closed", () => {
  const rejected = [
    entitlement({
      entitlementId: "expired",
      status: "expired",
    }),
    entitlement({
      entitlementId: "future",
      startsAt: now + 1,
    }),
    entitlement({
      entitlementId: "ended",
      endsAt: now,
    }),
    entitlement({
      entitlementId: "wrong-user",
      subjectId: "user-2",
    }),
    entitlement({
      entitlementId: "wrong-source",
      source: "staff",
    }),
    entitlement({
      entitlementId: "wrong-benefit",
      benefit: {
        kind: "bundle",
        bundle: "guild-subscription",
      },
    }),
    entitlement({
      entitlementId: "invalid-consumable",
      category: "consumable-one-time-purchase",
      benefit: {
        kind: "consumable",
        consumableType: "unranked-energy",
        quantity: 0,
      },
    }),
    entitlement({
      entitlementId: "test-production",
      category: "test-grant",
      source: "test-fixture",
    }),
  ]
  const access = resolve(rejected)

  assert.deepEqual(
    access.rejectedEntitlementIds,
    rejected.map((record) => record.entitlementId)
  )
  assert.deepEqual(access.appliedEntitlementIds, [])
})

test("trial, bounded grace, and audited grant categories can resolve", () => {
  const access = resolveCleoPetAccess({
    userId,
    guildId,
    now,
    environment: "test",
    entitlements: [
      entitlement({
        entitlementId: "trial",
        status: "trialing",
      }),
      entitlement({
        entitlementId: "grace",
        status: "grace",
        graceEndsAt: now + 1,
      }),
      entitlement({
        entitlementId: "staff-theme",
        category: "staff-grant",
        source: "staff",
        benefit: {
          kind: "durable-cosmetic",
          cosmeticType: "profile-theme",
          assetKey: "staff-cyan",
        },
      }),
      entitlement({
        entitlementId: "creator-title",
        category: "creator-grant",
        source: "creator-program",
        benefit: {
          kind: "durable-cosmetic",
          cosmeticType: "profile-title",
          assetKey: "creator",
        },
      }),
      entitlement({
        entitlementId: "test-user",
        category: "test-grant",
        source: "test-fixture",
      }),
    ],
  })

  assert.equal(access.appliedEntitlementIds.length, 5)
  assert.deepEqual(access.durableCosmeticKeys, [
    "profile-theme:staff-cyan",
    "profile-title:creator",
  ])
})

test("grant bundle scope and malformed edge cases resolve fail closed", () => {
  const records: CleoEntitlementRecord[] = [
    entitlement({
      entitlementId: "staff-guild",
      category: "staff-grant",
      source: "staff",
      subjectType: "guild",
      subjectId: guildId,
      benefit: {
        kind: "bundle",
        bundle: "guild-subscription",
      },
    }),
    entitlement({
      entitlementId: "wrong-guild",
      category: "guild-subscription",
      source: "discord",
      subjectType: "guild",
      subjectId: "guild-2",
      benefit: {
        kind: "bundle",
        bundle: "guild-subscription",
      },
    }),
    entitlement({
      entitlementId: "grace-without-window",
      status: "grace",
    }),
    entitlement({
      entitlementId: "grace-ended",
      status: "grace",
      graceEndsAt: now,
    }),
    entitlement({
      entitlementId: "revoked",
      status: "revoked",
    }),
    entitlement({
      entitlementId: "blank-cosmetic",
      category: "durable-one-time-purchase",
      benefit: {
        kind: "durable-cosmetic",
        cosmeticType: "pet-skin",
        assetKey: " ",
      },
    }),
    entitlement({
      entitlementId: "guild-cosmetic-purchase",
      category: "durable-one-time-purchase",
      subjectType: "guild",
      subjectId: guildId,
      benefit: {
        kind: "durable-cosmetic",
        cosmeticType: "pet-skin",
        assetKey: "guild-only",
      },
    }),
    entitlement({
      entitlementId: "guild-consumable",
      category: "consumable-one-time-purchase",
      subjectType: "guild",
      subjectId: guildId,
      benefit: {
        kind: "consumable",
        consumableType: "event-entry",
        quantity: 1,
      },
    }),
    entitlement({
      entitlementId: "fractional-consumable",
      category: "consumable-one-time-purchase",
      benefit: {
        kind: "consumable",
        consumableType: "event-entry",
        quantity: 1.5,
      },
    }),
    entitlement({
      entitlementId: "grant-consumable",
      category: "creator-grant",
      source: "creator-program",
      benefit: {
        kind: "consumable",
        consumableType: "event-entry",
        quantity: 1,
      },
    }),
    entitlement({
      entitlementId: "trial-durable",
      category: "durable-one-time-purchase",
      status: "trialing",
      benefit: {
        kind: "durable-cosmetic",
        cosmeticType: "pet-skin",
        assetKey: "invalid-trial",
      },
    }),
  ]
  const access = resolve(records)

  assert.equal(hasCleoPetCapability(access, "guilds.events"), true)
  assert.deepEqual(access.appliedEntitlementIds, ["staff-guild"])
  assert.deepEqual(
    access.rejectedEntitlementIds,
    records.slice(1).map((record) => record.entitlementId)
  )
})

test("public Cleo profile payload guard rejects private commerce and account data", () => {
  assert.equal(
    isCleoPublicProfilePayloadSafe({
      displayName: "Jason",
      activePet: {
        species: "bytefox",
        level: 12,
      },
      card: {
        frame: "cyan-circuit",
      },
    }),
    true
  )

  for (const unsafePayload of [
    { billingCustomerId: "cus_private" },
    { plan: "pro" },
    { stripeSubscriptionId: "sub_private" },
    { entitlementIds: ["ent_private"] },
    { privateGuildId: "123456789012345678" },
    { supportTicketId: "ticket" },
    { moderationRecords: [] },
    { internalLogs: [] },
    { linearIssue: "JCN-114" },
    { contact: "private@example.com" },
    [{ nestedToken: "secret" }],
  ]) {
    assert.equal(isCleoPublicProfilePayloadSafe(unsafePayload), false)
  }

  assert.equal(isCleoPublicProfilePayloadSafe(null), true)
  assert.equal(isCleoPublicProfilePayloadSafe(12), true)
})

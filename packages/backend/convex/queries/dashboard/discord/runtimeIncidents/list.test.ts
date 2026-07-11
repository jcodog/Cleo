import assert from "node:assert/strict"
import { test } from "node:test"

import type { Doc, Id } from "../../../../_generated/dataModel"
import { isAppFeatureGateEnabledForUser } from "../../../../lib/appFeatureGates"
import {
  buildDashboardRuntimeIncidentsResult,
  getRuntimeIncidentAccessStatus,
  normaliseIncidentLimit,
} from "./list"

const staffUser = userDoc({ role: "staff" })
const normalUser = userDoc({ role: "user" })

test("runtime incident query access denies non-staff users", () => {
  assert.equal(getRuntimeIncidentAccessStatus(normalUser, true), "forbidden")
})

test("runtime incident query access denies disabled feature gates", () => {
  assert.equal(getRuntimeIncidentAccessStatus(staffUser, false), "disabled")
})

test("runtime incident feature gate allows global and user-specific access", () => {
  assert.equal(
    isAppFeatureGateEnabledForUser(
      {
        enabled: true,
        enabledForClerkUserIds: undefined,
      },
      staffUser
    ),
    true
  )

  assert.equal(
    isAppFeatureGateEnabledForUser(
      {
        enabled: false,
        enabledForClerkUserIds: [staffUser.clerkUserId],
      },
      staffUser
    ),
    true
  )

  assert.equal(isAppFeatureGateEnabledForUser(null, staffUser), false)
})

test("runtime incident query returns bounded results for staff with enabled gate", () => {
  const result = buildDashboardRuntimeIncidentsResult({
    args: { limit: 2 },
    featureEnabled: true,
    incidents: [
      runtimeIncident({ lastSeenAt: 1_000, message: "old" }),
      runtimeIncident({ lastSeenAt: 3_000, message: "newest" }),
      runtimeIncident({ lastSeenAt: 2_000, message: "middle" }),
    ],
    user: staffUser,
  })

  assertReady(result)
  assert.deepEqual(
    result.incidents.map((incident) => incident.message),
    ["newest", "middle"]
  )
})

test("runtime incident query filters by severity and service area", () => {
  const result = buildDashboardRuntimeIncidentsResult({
    args: {
      serviceArea: "gateway",
      severity: "critical",
    },
    featureEnabled: true,
    incidents: [
      runtimeIncident({
        message: "matches",
        serviceArea: "gateway",
        severity: "critical",
      }),
      runtimeIncident({
        message: "wrong severity",
        serviceArea: "gateway",
        severity: "error",
      }),
      runtimeIncident({
        message: "wrong service area",
        serviceArea: "command",
        severity: "critical",
      }),
    ],
    user: staffUser,
  })

  assertReady(result)
  assert.deepEqual(
    result.incidents.map((incident) => incident.message),
    ["matches"]
  )
})

test("runtime incident query filters by Discord guild and last seen range", () => {
  const result = buildDashboardRuntimeIncidentsResult({
    args: {
      discordGuildId: "111111111111111111",
      lastSeenAtFrom: 1_500,
      lastSeenAtTo: 2_500,
    },
    featureEnabled: true,
    incidents: [
      runtimeIncident({
        discordGuildId: "111111111111111111",
        lastSeenAt: 2_000,
        message: "matches",
      }),
      runtimeIncident({
        discordGuildId: "222222222222222222",
        lastSeenAt: 2_000,
        message: "wrong guild",
      }),
      runtimeIncident({
        discordGuildId: "111111111111111111",
        lastSeenAt: 3_000,
        message: "outside range",
      }),
    ],
    user: staffUser,
  })

  assertReady(result)
  assert.deepEqual(
    result.incidents.map((incident) => incident.message),
    ["matches"]
  )
})

test("runtime incident query does not expose unsafe document fields", () => {
  const result = buildDashboardRuntimeIncidentsResult({
    args: {},
    featureEnabled: true,
    incidents: [
      runtimeIncident({
        metadata: { safe: "redacted" },
        stack: "secret stack",
      }),
    ],
    user: staffUser,
  })

  assertReady(result)
  const incident = result.incidents[0]

  assert.ok(incident)
  assert.equal(Object.hasOwn(incident, "stack"), false)
  assert.equal(Object.hasOwn(incident, "createdAt"), false)
  assert.deepEqual(incident.metadata, { safe: "redacted" })
})

test("runtime incident query clamps invalid limits", () => {
  assert.equal(normaliseIncidentLimit(0), 1)
  assert.equal(normaliseIncidentLimit(1_000), 100)
  assert.equal(normaliseIncidentLimit(undefined), 50)
})

function userDoc({
  role,
  status,
}: {
  role: Doc<"users">["role"]
  status?: Doc<"users">["status"]
}): Doc<"users"> {
  const now = 1_700_000_000_000

  return {
    _creationTime: now,
    _id: "users:staff" as Id<"users">,
    clerkUserId: `clerk-${role}`,
    createdAt: now,
    displayName: "Cleo Staff",
    email: `${role}@example.com`,
    imageUrl: null,
    role,
    status,
    updatedAt: now,
  }
}

function runtimeIncident(
  overrides: Partial<Doc<"discordBotRuntimeErrors">> = {}
): Doc<"discordBotRuntimeErrors"> {
  const now = 1_700_000_000_000
  const message = overrides.message ?? "Gateway unavailable"

  return {
    _creationTime: now,
    _id: `discordBotRuntimeErrors:${message}` as Id<"discordBotRuntimeErrors">,
    commandName: undefined,
    createdAt: now,
    discordGuildId: "111111111111111111",
    eventName: undefined,
    fingerprint: `fingerprint:${message}`,
    firstSeenAt: now - 1_000,
    guildId: undefined,
    lastSeenAt: now,
    message,
    metadata: undefined,
    occurrenceCount: 1,
    operation: undefined,
    serviceArea: "gateway",
    severity: "error",
    stack: undefined,
    updatedAt: now,
    ...overrides,
  }
}

type RuntimeIncidentResult = ReturnType<
  typeof buildDashboardRuntimeIncidentsResult
>

function assertReady(
  result: RuntimeIncidentResult
): asserts result is Extract<RuntimeIncidentResult, { status: "ready" }> {
  if (result.status !== "ready") {
    assert.fail(`Expected ready result, got ${result.status}`)
  }
}

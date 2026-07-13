import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildCleoGuildDashboardUrl,
  buildCleoGuildStatusView,
} from "./cleoGuildStatus"

const GUILD_ID = "123456789012345678"

test("buildCleoGuildStatusView describes configured and incomplete modules", () => {
  const view = buildCleoGuildStatusView(
    GUILD_ID,
    {
      status: "ready",
      config: {
        discordGuildId: GUILD_ID,
        moderationEnabled: true,
        welcomeEnabled: true,
        loggingEnabled: true,
        supportEnabled: true,
        welcomeChannelId: "223456789012345678",
        logLevel: "maximum",
        logChannelId: "323456789012345678",
        supportStaffRoleIds: [],
        supportTargetId: "423456789012345678",
        supportTargetType: "forum",
      },
    },
    "https://dashboard.example.com/ignored?source=test#fragment"
  )

  assert.equal(
    view.dashboardUrl,
    `https://dashboard.example.com/dashboard/${GUILD_ID}`
  )
  assert.match(view.content, /Configuration is connected/)
  assert.match(view.content, /✅ \*\*Moderation\*\* · On/)
  assert.match(
    view.content,
    /✅ \*\*Welcome\*\* · On · <#223456789012345678>/
  )
  assert.match(view.content, /✅ \*\*Logging\*\* · On · Maximum detail/)
  assert.match(view.content, /⚠️ \*\*Support\*\* · On, setup incomplete/)
})

test("buildCleoGuildStatusView describes disabled modules without false setup warnings", () => {
  const view = buildCleoGuildStatusView(GUILD_ID, {
    status: "ready",
    config: {
      discordGuildId: GUILD_ID,
      moderationEnabled: false,
      welcomeEnabled: false,
      loggingEnabled: false,
      supportEnabled: false,
    },
  })

  assert.match(view.content, /◻️ \*\*Moderation\*\* · Off/)
  assert.match(view.content, /◻️ \*\*Welcome\*\* · Off/)
  assert.match(view.content, /◻️ \*\*Logging\*\* · Off/)
  assert.match(view.content, /◻️ \*\*Support\*\* · Off/)
  assert.doesNotMatch(view.content, /setup incomplete/)
})

test("buildCleoGuildStatusView explains incomplete server setup", () => {
  for (const reason of ["missingConfig", "unknownGuild"] as const) {
    const view = buildCleoGuildStatusView(GUILD_ID, {
      status: "disabled",
      reason,
    })

    assert.match(view.content, /Setup is incomplete/)
    assert.match(view.content, /does not have an active configuration/)
    assert.doesNotMatch(view.content, new RegExp(reason))
  }
})

test("buildCleoGuildStatusView explains stale installation state", () => {
  const view = buildCleoGuildStatusView(GUILD_ID, {
    status: "disabled",
    reason: "botLeft",
  })

  assert.match(view.content, /Installation needs attention/)
  assert.match(view.content, /repair or reinstall/)
  assert.doesNotMatch(view.content, /botLeft/)
})

test("buildCleoGuildStatusView maps backend failures to safe guidance", () => {
  const unavailable = buildCleoGuildStatusView(GUILD_ID, {
    status: "disabled",
    reason: "convexUnavailable",
  })
  const invalid = buildCleoGuildStatusView(GUILD_ID, {
    status: "disabled",
    reason: "invalidBackendResponse",
  })

  assert.match(unavailable.content, /temporarily unavailable/)
  assert.match(unavailable.content, /safely disabled/)
  assert.doesNotMatch(unavailable.content, /convexUnavailable/)
  assert.match(invalid.content, /disabled for safety/)
  assert.doesNotMatch(invalid.content, /invalidBackendResponse/)
})

test("buildCleoGuildStatusView safely handles an invalid guild context", () => {
  const view = buildCleoGuildStatusView(GUILD_ID, {
    status: "disabled",
    reason: "invalidGuildId",
  })

  assert.match(view.content, /could not be identified/)
  assert.doesNotMatch(view.content, /invalidGuildId/)
})

test("buildCleoGuildDashboardUrl requires HTTPS", () => {
  assert.throws(
    () => buildCleoGuildDashboardUrl(GUILD_ID, "http://dashboard.example.com"),
    /must use HTTPS/
  )
})

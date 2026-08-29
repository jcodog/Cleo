import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildCleoGuildDashboardUrl,
  buildCleoGuildStatusView,
} from "./guildStatus"

const discordGuildId = "123456789012345678"

test("buildCleoGuildDashboardUrl creates the current guild management route", () => {
  assert.equal(
    buildCleoGuildDashboardUrl(discordGuildId),
    "https://cleoai.cloud/dashboard/123456789012345678"
  )
  assert.equal(
    buildCleoGuildDashboardUrl(
      discordGuildId,
      "https://dashboard.example.com/ignored?token=remove#fragment"
    ),
    "https://dashboard.example.com/dashboard/123456789012345678"
  )
})

test("buildCleoGuildDashboardUrl requires HTTPS", () => {
  assert.throws(
    () =>
      buildCleoGuildDashboardUrl(
        discordGuildId,
        "http://dashboard.example.com"
      ),
    /must use HTTPS/
  )
})

test("buildCleoGuildStatusView formats active and incomplete modules", () => {
  const view = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo *HQ*",
    result: {
      status: "ready",
      config: {
        discordGuildId,
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
  })

  assert.match(view.content, /Cleo status · Cleo \\\*HQ\\\*/)
  assert.match(view.content, /Configuration is connected/)
  assert.match(view.content, /✅ \*\*Moderation\*\* · On/)
  assert.match(view.content, /✅ \*\*Welcome\*\* · On · <#223456789012345678>/)
  assert.match(view.content, /✅ \*\*Logging\*\* · On · Maximum detail/)
  assert.match(view.content, /⚠️ \*\*Support\*\* · On, setup incomplete/)
})

test("buildCleoGuildStatusView covers alternate module setup branches", () => {
  const configured = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: {
      status: "ready",
      config: {
        discordGuildId,
        moderationEnabled: false,
        welcomeEnabled: true,
        loggingEnabled: true,
        supportEnabled: true,
        logLevel: "none",
        modLogChannelId: "323456789012345678",
        supportTargetId: "423456789012345678",
        supportTargetType: "forum",
        supportStaffRoleIds: ["523456789012345678"],
      },
    },
  })
  const partialSupport = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: {
      status: "ready",
      config: {
        discordGuildId,
        moderationEnabled: false,
        welcomeEnabled: false,
        loggingEnabled: true,
        supportEnabled: true,
        supportTargetId: "423456789012345678",
        supportStaffRoleIds: ["523456789012345678"],
      },
    },
  })
  const missingSupportRoles = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: {
      status: "ready",
      config: {
        discordGuildId,
        moderationEnabled: false,
        welcomeEnabled: false,
        loggingEnabled: false,
        supportEnabled: true,
        supportTargetId: "423456789012345678",
        supportTargetType: "forum",
      },
    },
  })

  assert.match(configured.content, /⚠️ \*\*Welcome\*\* · On, setup incomplete/)
  assert.match(configured.content, /✅ \*\*Logging\*\* · On$/m)
  assert.doesNotMatch(configured.content, /Logging\*\* · On ·/)
  assert.match(
    configured.content,
    /✅ \*\*Support\*\* · On · <#423456789012345678>/
  )
  assert.match(
    partialSupport.content,
    /⚠️ \*\*Logging\*\* · On, setup incomplete/
  )
  assert.match(
    partialSupport.content,
    /⚠️ \*\*Support\*\* · On, setup incomplete/
  )
  assert.match(
    missingSupportRoles.content,
    /⚠️ \*\*Support\*\* · On, setup incomplete/
  )
})

test("buildCleoGuildStatusView formats disabled modules without setup warnings", () => {
  const view = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: {
      status: "ready",
      config: {
        discordGuildId,
        moderationEnabled: false,
        welcomeEnabled: false,
        loggingEnabled: false,
        supportEnabled: false,
      },
    },
  })

  assert.match(view.content, /◻️ \*\*Moderation\*\* · Off/)
  assert.match(view.content, /◻️ \*\*Welcome\*\* · Off/)
  assert.match(view.content, /◻️ \*\*Logging\*\* · Off/)
  assert.match(view.content, /◻️ \*\*Support\*\* · Off/)
  assert.doesNotMatch(view.content, /setup incomplete/)
})

test("buildCleoGuildStatusView explains incomplete setup", () => {
  const missingConfig = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "missingConfig" },
  })
  const unknownGuild = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "unknownGuild" },
  })

  assert.match(missingConfig.content, /Setup is incomplete/)
  assert.match(missingConfig.content, /active configuration/)
  assert.doesNotMatch(missingConfig.content, /missingConfig/)
  assert.match(unknownGuild.content, /Server is not connected/)
  assert.match(unknownGuild.content, /connect the server/)
  assert.doesNotMatch(unknownGuild.content, /unknownGuild/)
})

test("buildCleoGuildStatusView explains stale installation state", () => {
  const view = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "botLeft" },
  })

  assert.match(view.content, /Installation needs attention/)
  assert.match(view.content, /repair or reinstall/)
  assert.doesNotMatch(view.content, /botLeft/)
})

test("buildCleoGuildStatusView maps backend failures to safe guidance", () => {
  const unavailable = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "convexUnavailable" },
  })
  const invalid = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "invalidBackendResponse" },
  })
  const invalidGuild = buildCleoGuildStatusView({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "invalidGuildId" },
  })

  assert.match(unavailable.content, /temporarily unavailable/)
  assert.match(unavailable.content, /safely disabled/)
  assert.doesNotMatch(unavailable.content, /convexUnavailable/)
  assert.match(invalid.content, /disabled for safety/)
  assert.doesNotMatch(invalid.content, /invalidBackendResponse/)
  assert.match(invalidGuild.content, /could not be identified/)
  assert.doesNotMatch(invalidGuild.content, /invalidGuildId/)
})

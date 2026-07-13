import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildCleoGuildDashboardUrl,
  buildCleoGuildStatusMessage,
} from "./guildStatus"

const discordGuildId = "123456789012345678"

test("buildCleoGuildDashboardUrl creates the current guild management route", () => {
  assert.equal(
    buildCleoGuildDashboardUrl(discordGuildId),
    "https://beta.cleoai.cloud/dashboard/123456789012345678"
  )
  assert.equal(
    buildCleoGuildDashboardUrl(
      discordGuildId,
      "https://dashboard.example.com/ignored?token=remove#fragment"
    ),
    "https://dashboard.example.com/dashboard/123456789012345678"
  )
})

test("buildCleoGuildStatusMessage formats active module state", () => {
  const message = buildCleoGuildStatusMessage({
    discordGuildId,
    guildName: "Cleo HQ",
    result: {
      status: "ready",
      config: {
        discordGuildId,
        moderationEnabled: true,
        welcomeEnabled: false,
        loggingEnabled: true,
        supportEnabled: true,
        logLevel: "maximum",
      },
    },
  })

  assert.equal(
    message,
    [
      "**Cleo status · Cleo HQ**",
      "Configuration: **Active**",
      "Moderation: Enabled",
      "Welcome: Disabled",
      "Logging: Enabled · Maximum",
      "Support: Enabled",
      "",
      "Manage Cleo: <https://beta.cleoai.cloud/dashboard/123456789012345678>",
    ].join("\n")
  )
})

test("buildCleoGuildStatusMessage handles enabled logging without an active level", () => {
  for (const logLevel of [undefined, "none"] as const) {
    const message = buildCleoGuildStatusMessage({
      discordGuildId,
      guildName: "Cleo HQ",
      result: {
        status: "ready",
        config: {
          discordGuildId,
          moderationEnabled: false,
          welcomeEnabled: false,
          loggingEnabled: true,
          supportEnabled: false,
          ...(logLevel === undefined ? {} : { logLevel }),
        },
      },
    })

    assert.match(message, /Logging: Enabled/)
    assert.doesNotMatch(message, /Logging: Enabled ·/)
  }
})

test("buildCleoGuildStatusMessage formats incomplete setup", () => {
  const message = buildCleoGuildStatusMessage({
    discordGuildId,
    guildName: "Cleo HQ",
    result: {
      status: "disabled",
      reason: "missingConfig",
    },
  })

  assert.match(message, /Configuration: \*\*Needs setup\*\*/)
  assert.match(message, /Moderation: Not configured/)
  assert.match(message, /Finish this server's Cleo setup in the dashboard\./)
  assert.match(message, new RegExp(discordGuildId))
})

test("buildCleoGuildStatusMessage hides backend failure details", () => {
  for (const reason of [
    "convexUnavailable",
    "invalidBackendResponse",
    "invalidGuildId",
  ] as const) {
    const message = buildCleoGuildStatusMessage({
      discordGuildId,
      guildName: "Cleo HQ",
      result: {
        status: "disabled",
        reason,
      },
    })

    assert.match(message, /Configuration: \*\*Temporarily unavailable\*\*/)
    assert.match(message, /Cleo could not verify this server's settings\./)
    assert.doesNotMatch(message, /convex|backend|invalid/i)
  }
})

test("buildCleoGuildStatusMessage distinguishes missing guild reconciliation", () => {
  const unknownGuild = buildCleoGuildStatusMessage({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "unknownGuild" },
  })
  const botLeft = buildCleoGuildStatusMessage({
    discordGuildId,
    guildName: "Cleo HQ",
    result: { status: "disabled", reason: "botLeft" },
  })

  assert.match(unknownGuild, /Configuration: \*\*Not connected\*\*/)
  assert.match(botLeft, /Configuration: \*\*Reconnecting\*\*/)
})

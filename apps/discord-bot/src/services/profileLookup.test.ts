import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from "discord.js"

import profile from "@/handlers/commands/user/profile"
import type { DiscordProfileLookupResult } from "./convexBotClient"
import {
  createBackendUnavailableProfileContent,
  createProfileContent,
  handleProfileCommand,
} from "./profileLookup"
import type { DiscordRuntimeErrorReportInput } from "./runtimeErrorReporter"

const discordUserId = "123456789012345678"
const interactionId = "234567890123456789"

type InteractionDouble = ChatInputCommandInteraction & {
  replies: InteractionReplyOptions[]
}

function linkedProfile(
  overrides: Partial<Extract<DiscordProfileLookupResult, { status: "linked" }>> = {}
): DiscordProfileLookupResult {
  return {
    status: "linked",
    account: {
      displayName: "Jason",
      role: "staff",
      status: "active",
    },
    discordIdentity: {
      username: "jason",
      displayName: "Jason Discord",
    },
    ...overrides,
  }
}

function createInteraction(): InteractionDouble {
  const replies: InteractionReplyOptions[] = []

  return {
    id: interactionId,
    commandName: "profile",
    user: {
      id: discordUserId,
    },
    replies,
    async reply(message: InteractionReplyOptions) {
      replies.push(message)
    },
  } as unknown as InteractionDouble
}

function createRuntimeErrorCollector() {
  const reports: DiscordRuntimeErrorReportInput[] = []

  return {
    reports,
    async reportRuntimeError(input: DiscordRuntimeErrorReportInput) {
      reports.push(input)
      return null
    },
  }
}

test("/profile command metadata remains user-install private-context only", () => {
  assert.equal(profile.data.name, "profile")
  assert.deepEqual(profile.data.integration_types, [
    ApplicationIntegrationType.UserInstall,
  ])
  assert.deepEqual(profile.data.contexts, [
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  ])
})

test("linked account profile response uses safe account data", async () => {
  const interaction = createInteraction()
  const reporter = createRuntimeErrorCollector()

  await handleProfileCommand(interaction, {
    async fetchProfile() {
      return linkedProfile()
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.deepEqual(interaction.replies, [
    {
      flags: MessageFlags.Ephemeral,
      content: createProfileContent(linkedProfile()),
    },
  ])
  assert.match(interaction.replies[0]?.content ?? "", /Linked: `Yes`/)
  assert.match(interaction.replies[0]?.content ?? "", /Account role: `Staff`/)
  assert.equal(reporter.reports.length, 0)
})

test("unlinked account profile response is clean and non-throwing", async () => {
  const interaction = createInteraction()
  const reporter = createRuntimeErrorCollector()

  await assert.doesNotReject(async () => {
    await handleProfileCommand(interaction, {
      async fetchProfile() {
        return {
          status: "unlinked",
        }
      },
      reportRuntimeError: reporter.reportRuntimeError,
    })
  })

  assert.match(interaction.replies[0]?.content ?? "", /Linked: `No`/)
  assert.match(interaction.replies[0]?.content ?? "", /link Discord/)
  assert.equal(reporter.reports.length, 0)
})

test("backend unavailable profile response is clean and reports incident", async () => {
  const interaction = createInteraction()
  const reporter = createRuntimeErrorCollector()
  const loggedErrors: unknown[] = []

  await handleProfileCommand(interaction, {
    async fetchProfile() {
      return null
    },
    logError(message, error, metadata) {
      loggedErrors.push({ message, error, metadata })
    },
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.deepEqual(interaction.replies, [
    {
      flags: MessageFlags.Ephemeral,
      content: createBackendUnavailableProfileContent(),
    },
  ])
  assert.equal(
    (loggedErrors[0] as { message: string }).message,
    "Discord profile lookup failed."
  )
  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.serviceArea, "backend")
  assert.equal(reporter.reports[0]?.operation, "fetchDiscordProfile")
})

test("profile backend throw is handled without unhandled rejection", async () => {
  const interaction = createInteraction()
  const reporter = createRuntimeErrorCollector()

  await assert.doesNotReject(async () => {
    await handleProfileCommand(interaction, {
      async fetchProfile() {
        throw new Error("backend failed")
      },
      reportRuntimeError: reporter.reportRuntimeError,
    })
  })

  assert.match(interaction.replies[0]?.content ?? "", /temporarily unavailable/)
  assert.equal(reporter.reports.length, 1)
})

test("profile responses do not expose private account fields", () => {
  const linked = createProfileContent(linkedProfile())
  const unlinked = createProfileContent({ status: "unlinked" })
  const unavailable = createBackendUnavailableProfileContent()

  for (const content of [linked, unlinked, unavailable]) {
    assert.doesNotMatch(content, /clerk/i)
    assert.doesNotMatch(content, /email/i)
    assert.doesNotMatch(content, /billing/i)
    assert.doesNotMatch(content, /token/i)
    assert.doesNotMatch(content, new RegExp(discordUserId))
  }
})

test("linked profile content handles fallback names and privileged statuses", () => {
  const usernameFallback = createProfileContent(
    linkedProfile({
      account: {
        role: "admin",
        status: "active",
      },
      discordIdentity: {
        username: "fallback-user",
      },
    })
  )

  assert.match(usernameFallback, /Name: `fallback-user`/)
  assert.match(usernameFallback, /Discord identity: `fallback-user`/)
  assert.match(usernameFallback, /Account role: `Admin`/)

  const unsetFallback = createProfileContent(
    linkedProfile({
      account: {
        role: "superadmin",
        status: "disabled",
      },
      discordIdentity: {},
    })
  )

  assert.match(unsetFallback, /Name: `Not set`/)
  assert.match(unsetFallback, /Discord identity: `Linked`/)
  assert.match(unsetFallback, /Account role: `Super Admin`/)
  assert.match(unsetFallback, /Account status: `Disabled`/)
})

test("profile runtime reporter failure is swallowed", async () => {
  const interaction = createInteraction()
  const loggedErrors: unknown[] = []

  await assert.doesNotReject(async () => {
    await handleProfileCommand(interaction, {
      async fetchProfile() {
        return null
      },
      logError(message, error, metadata) {
        loggedErrors.push({ message, error, metadata })
      },
      async reportRuntimeError() {
        throw new Error("report failed")
      },
    })
  })

  assert.equal(
    (loggedErrors[1] as { message: string }).message,
    "Discord profile runtime error report failed."
  )
})

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionReplyOptions,
} from "discord.js"

import ban from "@/handlers/commands/moderation/ban"
import kick from "@/handlers/commands/moderation/kick"
import type { DiscordModerationActionRecord } from "./convexBotClient"
import type { DiscordGuildRuntimeConfigResult } from "./guildRuntimeConfig"
import {
  handleModerationCommand,
  sanitiseModerationReason,
  type ModerationActionType,
} from "./moderationActions"
import type { DiscordRuntimeErrorReportInput } from "./runtimeErrorReporter"

const guildId = "123456789012345678"
const actorId = "234567890123456789"
const targetId = "345678901234567890"
const botId = "456789012345678901"
const ownerId = "567890123456789012"
const interactionId = "678901234567890123"
const now = 1_800_000_000_000

type InteractionDouble = ChatInputCommandInteraction & {
  replies: unknown[]
  edits: unknown[]
}

type InteractionOptions = {
  actionType?: ModerationActionType
  cachedGuild?: boolean
  actorPermissions?: bigint[]
  botPermissions?: bigint[]
  actorRolePosition?: number
  botRolePosition?: number
  targetRolePosition?: number
  targetUserId?: string
  targetMember?: GuildMember | null
  reason?: string
  ownerDiscordId?: string
}

function readyConfig(
  moderationEnabled: boolean
): DiscordGuildRuntimeConfigResult {
  return {
    status: "ready",
    config: {
      discordGuildId: guildId,
      moderationEnabled,
      welcomeEnabled: false,
      loggingEnabled: false,
      supportEnabled: false,
    },
  }
}

function createMember({
  id,
  permissions = [],
  rolePosition,
}: {
  id: string
  permissions?: bigint[]
  rolePosition: number
}): GuildMember {
  return {
    id,
    permissions: new PermissionsBitField(permissions),
    roles: {
      highest: {
        position: rolePosition,
      },
    },
    async ban() {
      return undefined
    },
    async kick() {
      return undefined
    },
  } as unknown as GuildMember
}

function createInteraction({
  actionType = "ban",
  cachedGuild = true,
  actorPermissions,
  botPermissions,
  actorRolePosition = 50,
  botRolePosition = 45,
  targetRolePosition = 10,
  targetUserId = targetId,
  targetMember,
  reason = "Spamming token=secret",
  ownerDiscordId = ownerId,
}: InteractionOptions = {}): InteractionDouble {
  const requiredPermission =
    actionType === "ban"
      ? PermissionFlagsBits.BanMembers
      : PermissionFlagsBits.KickMembers
  const actorMember = createMember({
    id: actorId,
    permissions: actorPermissions ?? [requiredPermission],
    rolePosition: actorRolePosition,
  })
  const botMember = createMember({
    id: botId,
    permissions: botPermissions ?? [requiredPermission],
    rolePosition: botRolePosition,
  })
  const resolvedTargetMember =
    targetMember === undefined
      ? createMember({
          id: targetUserId,
          rolePosition: targetRolePosition,
        })
      : targetMember
  const replies: unknown[] = []
  const edits: unknown[] = []

  return {
    id: interactionId,
    commandName: actionType,
    guildId,
    guild: {
      id: guildId,
      ownerId: ownerDiscordId,
      members: {
        me: botMember,
      },
    },
    user: {
      id: actorId,
    },
    client: {
      user: {
        id: botId,
      },
    },
    member: actorMember,
    memberPermissions: new PermissionsBitField(
      actorPermissions ?? [requiredPermission]
    ),
    options: {
      getUser(name: string) {
        assert.equal(name, "user")
        return {
          id: targetUserId,
        }
      },
      getMember(name: string) {
        assert.equal(name, "user")
        return resolvedTargetMember
      },
      getString(name: string) {
        assert.equal(name, "reason")
        return reason
      },
    },
    inCachedGuild() {
      return cachedGuild
    },
    replied: false,
    deferred: false,
    replies,
    edits,
    async reply(message: InteractionReplyOptions) {
      replies.push(message)
    },
    async editReply(message: unknown) {
      edits.push(message)
    },
  } as unknown as InteractionDouble
}

function createRecorder(options: { returnNull?: boolean } = {}) {
  const records: DiscordModerationActionRecord[] = []

  return {
    records,
    async recordAction(action: DiscordModerationActionRecord) {
      records.push(action)

      if (options.returnNull) {
        return null
      }

      return {
        id: "moderation-action-id",
        deduplicated: false,
      } as never
    },
  }
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

test("/ban and /kick metadata registration is guild-only with clean options", () => {
  assert.equal(ban.data.name, "ban")
  assert.equal(kick.data.name, "kick")

  for (const [command, permission] of [
    [ban, PermissionFlagsBits.BanMembers],
    [kick, PermissionFlagsBits.KickMembers],
  ] as const) {
    assert.deepEqual(command.data.contexts, [InteractionContextType.Guild])
    assert.deepEqual(command.data.integration_types, [
      ApplicationIntegrationType.GuildInstall,
    ])
    assert.equal(command.data.default_member_permissions, permission.toString())
    assert.deepEqual(
      command.data.options?.map((option) => option.name),
      ["user", "reason"]
    )
    assert.equal(
      command.data.options?.[0]?.type,
      ApplicationCommandOptionType.User
    )
    assert.equal(command.data.options?.[0]?.required, true)
    assert.equal(
      command.data.options?.[1]?.type,
      ApplicationCommandOptionType.String
    )
    assert.equal(command.data.options?.[1]?.max_length, 512)
  }
})

test("guild-only behavior replies cleanly without records or incidents", async () => {
  const interaction = createInteraction({ cachedGuild: false })
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()

  const result = await handleModerationCommand(interaction, "ban", {
    recordAction: recorder.recordAction,
    reportRuntimeError: reporter.reportRuntimeError,
  })

  assert.deepEqual(result, {
    status: "denied",
    failureCode: "guildOnly",
  })
  assert.equal(recorder.records.length, 0)
  assert.equal(reporter.reports.length, 0)
  assert.deepEqual(interaction.replies, [
    {
      content: "This moderation command can only be used in a Discord server.",
      flags: MessageFlags.Ephemeral,
    },
  ])
})

test("actor permission denial records denied outcome without incident", async () => {
  const interaction = createInteraction({ actorPermissions: [] })
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()
  let executed = false

  const result = await handleModerationCommand(interaction, "ban", {
    async fetchConfig() {
      return readyConfig(true)
    },
    recordAction: recorder.recordAction,
    async executeDiscordAction() {
      executed = true
    },
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "denied",
    failureCode: "actorMissingPermission",
  })
  assert.equal(executed, false)
  assert.equal(recorder.records[0]?.result, "denied")
  assert.equal(recorder.records[0]?.failureCode, "actorMissingPermission")
  assert.equal(reporter.reports.length, 0)
})

test("moderation disabled denial records denied outcome", async () => {
  const interaction = createInteraction()
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()

  const result = await handleModerationCommand(interaction, "kick", {
    async fetchConfig() {
      return readyConfig(false)
    },
    recordAction: recorder.recordAction,
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "denied",
    failureCode: "moderationDisabled",
  })
  assert.equal(recorder.records[0]?.actionType, "kick")
  assert.equal(recorder.records[0]?.result, "denied")
  assert.equal(reporter.reports.length, 0)
})

test("moderation config unavailable denial records cleanly", async () => {
  const interaction = createInteraction()
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()

  const result = await handleModerationCommand(interaction, "ban", {
    async fetchConfig() {
      return {
        status: "disabled",
        reason: "convexUnavailable",
      }
    },
    recordAction: recorder.recordAction,
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "denied",
    failureCode: "moderationConfigUnavailable",
  })
  assert.equal(recorder.records[0]?.failureCode, "moderationConfigUnavailable")
  assert.match(
    (interaction.replies[0] as { content: string }).content,
    /not available/
  )
  assert.equal(reporter.reports.length, 0)
})

test("bot permission denial records denied outcome without incident", async () => {
  const interaction = createInteraction({ botPermissions: [] })
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()

  const result = await handleModerationCommand(interaction, "ban", {
    async fetchConfig() {
      return readyConfig(true)
    },
    recordAction: recorder.recordAction,
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "denied",
    failureCode: "botMissingPermission",
  })
  assert.equal(recorder.records[0]?.failureCode, "botMissingPermission")
  assert.equal(reporter.reports.length, 0)
})

test("target self, bot, owner, and unavailable denials are safe", async () => {
  for (const [options, failureCode] of [
    [{ targetUserId: actorId }, "targetSelf"],
    [{ targetUserId: botId }, "targetBot"],
    [{ targetUserId: ownerId }, "targetOwner"],
    [{ targetMember: null }, "targetUnavailable"],
  ] as const) {
    const interaction = createInteraction(options)
    const recorder = createRecorder()
    const reporter = createRuntimeErrorCollector()

    const result = await handleModerationCommand(interaction, "ban", {
      async fetchConfig() {
        return readyConfig(true)
      },
      recordAction: recorder.recordAction,
      reportRuntimeError: reporter.reportRuntimeError,
      now: () => now,
    })

    assert.deepEqual(result, {
      status: "denied",
      failureCode,
    })
    assert.equal(recorder.records[0]?.failureCode, failureCode)
    assert.equal(reporter.reports.length, 0)
  }
})

test("actor and bot role hierarchy denials are safe", async () => {
  for (const [options, failureCode] of [
    [
      { actionType: "kick", actorRolePosition: 10, targetRolePosition: 10 },
      "actorRoleTooLow",
    ],
    [
      { actionType: "kick", botRolePosition: 10, targetRolePosition: 10 },
      "botRoleTooLow",
    ],
  ] as const) {
    const interaction = createInteraction(options)
    const recorder = createRecorder()
    const reporter = createRuntimeErrorCollector()

    const result = await handleModerationCommand(interaction, "kick", {
      async fetchConfig() {
        return readyConfig(true)
      },
      recordAction: recorder.recordAction,
      reportRuntimeError: reporter.reportRuntimeError,
      now: () => now,
    })

    assert.deepEqual(result, {
      status: "denied",
      failureCode,
    })
    assert.equal(recorder.records[0]?.failureCode, failureCode)
    assert.equal(reporter.reports.length, 0)
  }
})

test("reason too long denial replies and records without incident", async () => {
  const interaction = createInteraction({ reason: "x".repeat(513) })
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()

  const result = await handleModerationCommand(interaction, "ban", {
    recordAction: recorder.recordAction,
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "denied",
    failureCode: "reasonTooLong",
  })
  assert.equal(recorder.records[0]?.failureCode, "reasonTooLong")
  assert.match((interaction.replies[0] as { content: string }).content, /512/)
  assert.equal(reporter.reports.length, 0)
})

test("moderation replies edit deferred interactions", async () => {
  const interaction = createInteraction({ actorPermissions: [] })
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()

  interaction.deferred = true

  const result = await handleModerationCommand(interaction, "ban", {
    async fetchConfig() {
      return readyConfig(true)
    },
    recordAction: recorder.recordAction,
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "denied",
    failureCode: "actorMissingPermission",
  })
  assert.equal(interaction.replies.length, 0)
  assert.match(
    (interaction.edits[0] as { content: string }).content,
    /permission/
  )
  assert.equal(reporter.reports.length, 0)
})

test("successful ban and kick call Discord API and record success", async () => {
  for (const actionType of ["ban", "kick"] as const) {
    const interaction = createInteraction({ actionType })
    const recorder = createRecorder()
    const reporter = createRuntimeErrorCollector()
    const calls: unknown[] = []

    const result = await handleModerationCommand(interaction, actionType, {
      async fetchConfig() {
        return readyConfig(true)
      },
      recordAction: recorder.recordAction,
      async executeDiscordAction(incomingActionType, member, reason) {
        calls.push({ incomingActionType, memberId: member.id, reason })
      },
      reportRuntimeError: reporter.reportRuntimeError,
      now: () => now,
    })

    assert.deepEqual(result, {
      status: "success",
    })
    assert.deepEqual(calls, [
      {
        incomingActionType: actionType,
        memberId: targetId,
        reason: "Spamming token=[redacted]",
      },
    ])
    assert.equal(recorder.records[0]?.result, "success")
    assert.equal(recorder.records[0]?.reason, "Spamming token=[redacted]")
    assert.equal(JSON.stringify(recorder.records[0]).includes("secret"), false)
    assert.equal(reporter.reports.length, 0)
  }
})

test("Discord API failure records failed outcome and reports runtime incident", async () => {
  const interaction = createInteraction()
  const recorder = createRecorder()
  const reporter = createRuntimeErrorCollector()

  const result = await handleModerationCommand(interaction, "ban", {
    async fetchConfig() {
      return readyConfig(true)
    },
    recordAction: recorder.recordAction,
    async executeDiscordAction() {
      throw new Error("Discord API failed")
    },
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "failed",
    failureCode: "discordApiFailed",
  })
  assert.equal(recorder.records[0]?.result, "failed")
  assert.equal(recorder.records[0]?.failureCode, "discordApiFailed")
  assert.equal(reporter.reports.length, 1)
  assert.equal(reporter.reports[0]?.serviceArea, "moderation")
  assert.equal(reporter.reports[0]?.operation, "executeDiscordModerationAction")
})

test("Convex record failure is logged and reported without hiding command reply", async () => {
  const interaction = createInteraction()
  const recorder = createRecorder({ returnNull: true })
  const reporter = createRuntimeErrorCollector()
  const loggedErrors: unknown[] = []

  const result = await handleModerationCommand(interaction, "ban", {
    async fetchConfig() {
      return readyConfig(true)
    },
    recordAction: recorder.recordAction,
    async executeDiscordAction() {
      return undefined
    },
    logError(message, error, metadata) {
      loggedErrors.push({ message, error, metadata })
    },
    reportRuntimeError: reporter.reportRuntimeError,
    now: () => now,
  })

  assert.deepEqual(result, {
    status: "success",
  })
  assert.equal(
    (loggedErrors[0] as { message: string }).message,
    "Discord moderation action record failed."
  )
  assert.equal(reporter.reports[0]?.operation, "recordModerationAction")
  assert.match(
    (interaction.replies[0] as { content: string }).content,
    /Member banned/
  )
})

test("reason sanitization and length limit are enforced", () => {
  assert.deepEqual(sanitiseModerationReason("  token=secret  "), {
    status: "ready",
    reason: "token=[redacted]",
  })

  assert.deepEqual(sanitiseModerationReason("x".repeat(513)), {
    status: "invalid",
    failureCode: "reasonTooLong",
  })
})

test("runtime reporter failure during moderation record failure is swallowed", async () => {
  const interaction = createInteraction()
  const loggedErrors: unknown[] = []

  await assert.doesNotReject(async () => {
    await handleModerationCommand(interaction, "ban", {
      async fetchConfig() {
        return readyConfig(true)
      },
      async recordAction() {
        throw new Error("record failed")
      },
      async executeDiscordAction() {
        return undefined
      },
      logError(message, error, metadata) {
        loggedErrors.push({ message, error, metadata })
      },
      async reportRuntimeError() {
        throw new Error("report failed")
      },
      now: () => now,
    })
  })

  assert.equal(
    (loggedErrors[1] as { message: string }).message,
    "Discord moderation runtime error report failed."
  )
})

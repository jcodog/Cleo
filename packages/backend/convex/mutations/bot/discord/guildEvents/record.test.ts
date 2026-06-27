import assert from "node:assert/strict"
import { test } from "node:test"

import {
  normaliseDiscordGuildEventForStorage,
  projectDiscordGuildEventToAudit,
  sanitiseDiscordGuildEventMetadata,
} from "./record"
import type { DiscordGuildEventRecordInput } from "../../../../lib/discordGuildEvents"

const now = 1_800_000_000_000
const guildId = "123456789012345678"
const userId = "234567890123456789"
const channelId = "345678901234567890"

function event(
  overrides: Partial<DiscordGuildEventRecordInput> = {}
): DiscordGuildEventRecordInput {
  return {
    discordGuildId: guildId,
    eventType: "guildMemberAdd",
    targetType: "member",
    targetDiscordId: userId,
    occurredAt: now,
    dedupeKey: `guildMemberAdd:${guildId}:${userId}:${now}`,
    ...overrides,
  }
}

test("guild event storage accepts valid supported events", () => {
  const normalised = normaliseDiscordGuildEventForStorage(
    event({
      actorDiscordUserId: "456789012345678901",
      targetDisplayName: " Jason ",
      reason: "Removed token=secret from reason",
      metadata: {
        count: 1,
        nested: {
          email: "user@example.com",
        },
      },
    }),
    now
  )

  assert.deepEqual(normalised, {
    discordGuildId: guildId,
    eventType: "guildMemberAdd",
    actorDiscordUserId: "456789012345678901",
    targetType: "member",
    targetDiscordId: userId,
    targetDisplayName: "Jason",
    reason: "Removed token=[redacted] from reason",
    metadata: {
      count: 1,
      nested: {
        email: "[redacted]",
      },
    },
    occurredAt: now,
    dedupeKey: `guildMemberAdd:${guildId}:${userId}:${now}`,
  })
})

test("guild event storage rejects malformed guild and target IDs", () => {
  assert.throws(() =>
    normaliseDiscordGuildEventForStorage(event({ discordGuildId: "bad" }), now)
  )

  assert.throws(() =>
    normaliseDiscordGuildEventForStorage(
      event({ targetDiscordId: "also-bad" }),
      now
    )
  )
})

test("guild event storage rejects oversized metadata and reason", () => {
  assert.throws(() =>
    normaliseDiscordGuildEventForStorage(
      event({
        metadata: {
          value: "x".repeat(5_100),
        },
      }),
      now
    )
  )

  assert.throws(() =>
    normaliseDiscordGuildEventForStorage(
      event({
        reason: "x".repeat(513),
      }),
      now
    )
  )
})

test("guild event storage rejects invalid timestamps", () => {
  assert.throws(() =>
    normaliseDiscordGuildEventForStorage(event({ occurredAt: -1 }), now)
  )

  assert.throws(() =>
    normaliseDiscordGuildEventForStorage(
      event({ occurredAt: now + 5 * 60 * 1000 + 1 }),
      now
    )
  )
})

test("guild event storage builds stable fallback dedupe keys", () => {
  const normalised = normaliseDiscordGuildEventForStorage(
    event({
      dedupeKey: undefined,
    }),
    now
  )

  assert.equal(
    normalised.dedupeKey,
    `guildMemberAdd:${guildId}:member:${userId}:${now}`
  )
})

test("messageDelete metadata strips raw message content", () => {
  const normalised = normaliseDiscordGuildEventForStorage(
    event({
      eventType: "messageDelete",
      targetType: "message",
      targetDiscordId: "567890123456789012",
      channelId,
      metadata: {
        content: "do not store this",
        cleanContent: "or this",
        safe: "kept",
        nested: {
          messageContent: "remove",
          count: 1,
        },
      },
    }),
    now
  )

  assert.deepEqual(normalised.metadata, {
    safe: "kept",
    nested: {
      count: 1,
    },
  })
})

test("messageDelete requires message and channel IDs", () => {
  assert.throws(() =>
    normaliseDiscordGuildEventForStorage(
      event({
        eventType: "messageDelete",
        targetType: "message",
        channelId: undefined,
      }),
      now
    )
  )
})

test("empty metadata is omitted after raw content stripping", () => {
  assert.equal(
    sanitiseDiscordGuildEventMetadata({
      content: "raw",
    }),
    undefined
  )
})

test("guild event audit projection is readable and keeps safe details", () => {
  const storedEvent = normaliseDiscordGuildEventForStorage(
    event({
      eventType: "guildBanAdd",
      targetType: "user",
      targetDisplayName: "Jason",
      reason: "Policy violation",
      metadata: {
        count: 1,
      },
    }),
    now
  )

  assert.deepEqual(projectDiscordGuildEventToAudit(storedEvent), {
    summary: "User banned: Jason",
    metadata: {
      reason: "Policy violation",
      targetDisplayName: "Jason",
    },
  })
})

test("guild event audit projection labels every supported event type", () => {
  const cases: Array<[DiscordGuildEventRecordInput["eventType"], string]> = [
    ["guildMemberAdd", "Member joined"],
    ["guildMemberRemove", "Member left"],
    ["guildBanAdd", "User banned"],
    ["guildBanRemove", "User unbanned"],
    ["channelCreate", "Channel created"],
    ["channelDelete", "Channel deleted"],
    ["roleCreate", "Role created"],
    ["roleDelete", "Role deleted"],
    ["messageDelete", "Message deleted"],
  ]

  for (const [eventType, label] of cases) {
    const storedEvent = normaliseDiscordGuildEventForStorage(
      eventForType(eventType),
      now
    )

    assert.match(
      projectDiscordGuildEventToAudit(storedEvent).summary,
      new RegExp(label)
    )
  }
})

function eventForType(
  eventType: DiscordGuildEventRecordInput["eventType"]
): DiscordGuildEventRecordInput {
  const base = event({ eventType })

  if (eventType === "channelCreate" || eventType === "channelDelete") {
    return {
      ...base,
      targetType: "channel",
      targetDiscordId: undefined,
      channelId,
    }
  }

  if (eventType === "roleCreate" || eventType === "roleDelete") {
    return {
      ...base,
      targetType: "role",
      targetDiscordId: undefined,
      roleId: "456789012345678901",
    }
  }

  if (eventType === "messageDelete") {
    return {
      ...base,
      targetType: "message",
      targetDiscordId: "567890123456789012",
      channelId,
    }
  }

  return base
}

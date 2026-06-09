import assert from "node:assert/strict"
import { test } from "node:test"

import type { Guild } from "discord.js"

import {
  createGuildLeftSnapshot,
  createGuildSnapshot,
  guildLeftSnapshotSchema,
  guildSnapshotSchema,
} from "./createGuildSnapshot"

const guildId = "123456789012345678"
const ownerDiscordId = "234567890123456789"

type GuildLike = {
  id: string
  name: string
  description: string | null
  iconURL: () => string | null
  icon: string | null
  ownerId: string
  memberCount: number
  joinedTimestamp: number | null
}

function guild(overrides: Partial<GuildLike> = {}): Guild {
  return {
    id: guildId,
    name: "Cleo HQ",
    description: null,
    iconURL: () => null,
    icon: null,
    ownerId: ownerDiscordId,
    memberCount: 42,
    joinedTimestamp: 1_700_000_000_000,
    ...overrides,
  } as unknown as Guild
}

test("createGuildSnapshot returns a validated deterministic snapshot", () => {
  assert.deepEqual(
    createGuildSnapshot(
      guild({
        description: "Community operations",
        iconURL: () => "https://cdn.example.com/icon.png",
        icon: "icon-hash",
      })
    ),
    {
      discordGuildId: guildId,
      name: "Cleo HQ",
      description: "Community operations",
      iconUrl: "https://cdn.example.com/icon.png",
      iconHash: "icon-hash",
      ownerDiscordId,
      memberCount: 42,
      botJoinedAt: 1_700_000_000_000,
    }
  )
})

test("createGuildLeftSnapshot returns a validated deterministic leave snapshot", (t) => {
  t.mock.method(Date, "now", () => 1_700_000_001_000)

  assert.deepEqual(createGuildLeftSnapshot(guild()), {
    discordGuildId: guildId,
    name: "Cleo HQ",
    leftAt: 1_700_000_001_000,
  })
})

test("guild snapshot schemas reject invalid pure snapshot data", () => {
  assert.equal(
    guildSnapshotSchema.safeParse({
      discordGuildId: "bad-guild-id",
      name: "Cleo HQ",
      ownerDiscordId,
      memberCount: 42,
    }).success,
    false
  )

  assert.equal(
    guildSnapshotSchema.safeParse({
      discordGuildId: guildId,
      name: "Cleo HQ",
      ownerDiscordId,
      memberCount: -1,
    }).success,
    false
  )

  assert.equal(
    guildLeftSnapshotSchema.safeParse({
      discordGuildId: guildId,
      name: "Cleo HQ",
      leftAt: -1,
    }).success,
    false
  )
})

import assert from "node:assert/strict"
import { test } from "node:test"
import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type MessageCreateOptions,
} from "discord.js"
import type { FunctionReturnType } from "convex/server"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { deliverTwitchLiveNotification } from "./twitchLiveNotifications"
import { convexBotClient } from "./convexBotClient"

type Job = FunctionReturnType<typeof api.liveNotificationActions.claim>[number]
const guildId = "123456789012345678"
const channelId = "234567890123456789"
const roleId = "345678901234567890"
const ownerId = "456789012345678901"

function fixture(
  options: {
    missingGuild?: boolean
    changedOwner?: boolean
    channelType?: ChannelType
    missingChannel?: boolean
    missingSend?: boolean
    missingMention?: boolean
    missingRole?: boolean
    roleMentionable?: boolean
    roleManaged?: boolean
    sendFailure?: boolean
    begin?: boolean | null
    finish?: boolean | null
    missingMe?: boolean
  } = {}
) {
  const sent: MessageCreateOptions[] = []
  const outcomes: unknown[] = []
  let reservations = 0
  const channel = {
    type: options.channelType ?? ChannelType.GuildText,
    permissionsFor: () => ({
      has: (permission: bigint | bigint[]) =>
        Array.isArray(permission)
          ? !options.missingSend
          : permission === PermissionFlagsBits.MentionEveryone
            ? !options.missingMention
            : true,
    }),
    send: async (payload: MessageCreateOptions) => {
      sent.push(payload)
      if (options.sendFailure) throw new Error("Discord failed")
      return { id: "567890123456789012" }
    },
  }
  const guild = {
    id: guildId,
    ownerId: options.changedOwner ? "567890123456789012" : ownerId,
    channels: { fetch: async () => (options.missingChannel ? null : channel) },
    members: { me: options.missingMe ? null : {}, fetchMe: async () => ({}) },
    roles: {
      fetch: async () =>
        options.missingRole
          ? null
          : {
              id: roleId,
              managed: !!options.roleManaged,
              mentionable: options.roleMentionable ?? true,
            },
    },
  }
  const client = {
    guilds: { cache: new Map(options.missingGuild ? [] : [[guildId, guild]]) },
  } as unknown as Client
  const job = {
    _id: "test-delivery",
    guildId: "test-guild",
    eventId: "test-event",
    _creationTime: 1,
    broadcasterId: "222",
    streamId: "9001",
    login: "verified_owner",
    displayName: "Owner",
    startedAt: "2026-10-01T15:00:00Z",
    state: "claimed",
    attempts: 1,
    createdAt: 1,
    updatedAt: 1,
    claim: "claim-1",
    discordGuildId: guildId,
    ownerDiscordId: ownerId,
    config: {
      _id: "test-config",
      _creationTime: 1,
      guildId: "test-guild",
      createdAt: 1,
      updatedAt: 1,
      liveNotificationsEnabled: true,
      liveNotificationChannelId: channelId,
      liveNotificationMentionMode: "none",
    },
  } as unknown as Job
  const backend = {
    claimLiveNotifications: async () => [job],
    beginLiveNotification: async () => {
      reservations++
      return options.begin === undefined ? true : options.begin
    },
    finishLiveNotification: async (input: unknown) => {
      outcomes.push(input)
      return options.finish === undefined ? true : options.finish
    },
  }
  return {
    client,
    job,
    backend,
    sent,
    outcomes,
    reservations: () => reservations,
  }
}

test("Discord client delivers Components V2 once only after durable reservation and records message ID", async () => {
  for (const channelType of [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
  ]) {
    const f = fixture({ channelType, missingMe: true })
    await deliverTwitchLiveNotification(f.client, f.job, f.backend)
    assert.equal(f.sent.length, 1)
    assert.equal(f.reservations(), 1)
    assert.deepEqual(f.outcomes, [
      {
        deliveryId: f.job._id,
        claim: f.job.claim,
        messageId: "567890123456789012",
      },
    ])
  }
})

test("Discord preflight rejects missing/unsupported destinations, changed owners and insufficient permission without sending", async () => {
  for (const options of [
    { missingGuild: true },
    { changedOwner: true },
    { missingChannel: true },
    { channelType: ChannelType.GuildForum },
    { channelType: ChannelType.PublicThread },
    { missingSend: true },
  ]) {
    const f = fixture(options)
    await deliverTwitchLiveNotification(f.client, f.job, f.backend)
    assert.equal(f.sent.length, 0)
    assert.equal(f.reservations(), 0)
    assert.deepEqual(f.outcomes, [
      {
        deliveryId: f.job._id,
        claim: f.job.claim,
        failure: "discordDeliveryFailed",
      },
    ])
  }
})

test("Discord validates everyone and custom-role permissions and handles missing roles safely", async () => {
  for (const options of [
    { missingMention: true },
    { missingRole: true },
    { roleManaged: true },
    { roleMentionable: false, missingMention: true },
    {},
  ]) {
    const f = fixture(options)
    f.job.config.liveNotificationMentionMode =
      options.missingMention && !("roleMentionable" in options)
        ? "everyone"
        : "role"
    f.job.config.liveNotificationRoleId = roleId
    await deliverTwitchLiveNotification(f.client, f.job, f.backend)
    assert.equal(f.sent.length, Object.keys(options).length === 0 ? 1 : 0)
  }
})

test("rejected reservation, Discord send failure and unavailable backend acknowledgement cannot trigger automatic resend", async (t) => {
  for (const begin of [false, null]) {
    const f = fixture({ begin })
    await deliverTwitchLiveNotification(f.client, f.job, f.backend)
    assert.equal(f.sent.length, 0)
    assert.equal(f.outcomes.length, 0)
  }
  const failed = fixture({ sendFailure: true })
  await deliverTwitchLiveNotification(failed.client, failed.job, failed.backend)
  assert.equal(failed.sent.length, 1)
  assert.equal(failed.reservations(), 1)
  assert.match(JSON.stringify(failed.outcomes), /discordDeliveryFailed/)
  const unacknowledged = fixture({ finish: null })
  t.mock.method(
    convexBotClient,
    "beginLiveNotification",
    unacknowledged.backend.beginLiveNotification
  )
  t.mock.method(
    convexBotClient,
    "finishLiveNotification",
    unacknowledged.backend.finishLiveNotification
  )
  await deliverTwitchLiveNotification(unacknowledged.client, unacknowledged.job)
  assert.equal(unacknowledged.sent.length, 1)
  assert.equal(unacknowledged.outcomes.length, 1)
})

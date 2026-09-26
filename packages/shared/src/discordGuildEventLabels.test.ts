import assert from "node:assert/strict"
import { test } from "node:test"

import {
  discordGuildEventTypes,
  formatDiscordGuildEventType,
} from "./discordGuildEventLabels"

test("formats every Discord guild event type for human-readable logs", () => {
  const labels = discordGuildEventTypes.map(formatDiscordGuildEventType)

  assert.deepEqual(labels, [
    "Member Joined",
    "Member Left",
    "User Banned",
    "User Unbanned",
    "Channel Created",
    "Channel Deleted",
    "Role Created",
    "Role Deleted",
    "Message Deleted",
  ])
})

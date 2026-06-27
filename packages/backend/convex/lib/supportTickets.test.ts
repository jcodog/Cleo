import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildActiveSupportTicketKey,
  getGuildSupportUnavailableReason,
  normalizeSupportMessage,
  normalizeSupportTicketInput,
  SUPPORT_MESSAGE_MAX_LENGTH,
} from "./supportTickets"

const userId = "123456789012345678"
const guildId = "234567890123456789"

test("support ticket inputs are bounded and redact secrets", () => {
  assert.deepEqual(
    normalizeSupportTicketInput({
      requesterDiscordUserId: userId,
      discordGuildId: guildId,
      message: "  Please rotate token=secret  ",
    }),
    {
      requesterDiscordUserId: userId,
      discordGuildId: guildId,
      message: "Please rotate token=[redacted]",
    }
  )

  assert.equal(normalizeSupportMessage("  "), undefined)
  assert.throws(() =>
    normalizeSupportMessage("x".repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1))
  )
  assert.throws(() =>
    normalizeSupportTicketInput({
      requesterDiscordUserId: "invalid",
    })
  )
})

test("active support ticket keys isolate JCN and guild routes", () => {
  assert.equal(
    buildActiveSupportTicketKey({ requesterDiscordUserId: userId }),
    `jcn:${userId}`
  )
  assert.equal(
    buildActiveSupportTicketKey({
      requesterDiscordUserId: userId,
      discordGuildId: guildId,
    }),
    `guild:${guildId}:${userId}`
  )
})

test("guild support readiness requires an enabled target and staff roles", () => {
  const configured = {
    enabled: true,
    staffRoleIds: ["345678901234567890"],
    targetId: "456789012345678901",
    targetType: "channel" as const,
    transcriptPolicy: "explicit-messages" as const,
    escalationPolicy: "jcn-product-only" as const,
  }

  assert.equal(getGuildSupportUnavailableReason(configured), null)
  assert.equal(
    getGuildSupportUnavailableReason({ ...configured, enabled: false }),
    "disabled"
  )
  assert.equal(
    getGuildSupportUnavailableReason({ ...configured, targetId: undefined }),
    "notConfigured"
  )
  assert.equal(getGuildSupportUnavailableReason(null), "notConfigured")
})

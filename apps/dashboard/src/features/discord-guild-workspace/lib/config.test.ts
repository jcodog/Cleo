import assert from "node:assert/strict"
import { test } from "node:test"

import type { GuildConfig } from "../types"
import {
  getChannelValues,
  getConfiguredChannelItems,
  getModuleItems,
  getModuleValues,
  toOptionalChannelValue,
  toOptionalTextValue,
} from "./config"

const config = {
  aiEnabled: true,
  moderationEnabled: false,
  welcomeEnabled: true,
  loggingEnabled: false,
  logChannelId: "123456789012345678",
  welcomeChannelId: "234567890123456789",
  welcomeSubtext: "Settle in, say hello, and enjoy the server.",
} as GuildConfig

test("guild workspace module helpers derive values from nullable config", () => {
  assert.deepEqual(getModuleValues(null), {
    aiEnabled: false,
    moderationEnabled: false,
    welcomeEnabled: false,
    loggingEnabled: false,
  })

  assert.deepEqual(getModuleValues(config), {
    aiEnabled: true,
    moderationEnabled: false,
    welcomeEnabled: true,
    loggingEnabled: false,
  })

  assert.deepEqual(getModuleItems(config), [
    {
      label: "AI Assistant",
    },
    {
      label: "Welcome",
    },
  ])
})

test("guild workspace channel helpers normalize empty and configured channels", () => {
  assert.deepEqual(getChannelValues(null), {
    logChannelId: "",
    modLogChannelId: "",
    welcomeChannelId: "",
    updatesChannelId: "",
    announcementChannelId: "",
  })

  assert.deepEqual(getConfiguredChannelItems(config), [
    {
      label: "Log Channel ID",
      value: "123456789012345678",
    },
    {
      label: "Welcome Channel ID",
      value: "234567890123456789",
    },
  ])

  assert.equal(
    toOptionalChannelValue("  123456789012345678  "),
    "123456789012345678"
  )
  assert.equal(toOptionalChannelValue("   "), null)
  assert.equal(toOptionalTextValue("  Hello there  "), "Hello there")
  assert.equal(toOptionalTextValue("   "), null)
})

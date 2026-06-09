import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js"

import type { CommandData } from "@workspace/discord-bot/classes/Command"
import { loadCommands } from "@workspace/discord-bot/loaders/loadCommands"

import {
  prepareCommandDataForTarget,
  resolveRegisterTarget,
  validateCommandData,
} from "./registerCommands"

const guildId = "123456789012345678"

function commandData(overrides: Partial<CommandData> = {}): CommandData {
  return {
    name: "ping",
    description: "Check whether Cleo is responding",
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    ...overrides,
  }
}

test("loaded command metadata is valid and unique", async () => {
  const commands = await loadCommands()
  const loadedCommandData = commands.map((command) => command.data)

  assert.deepEqual(
    loadedCommandData.map((command) => command.name).sort(),
    ["help", "ping", "profile"]
  )

  assert.doesNotThrow(() => validateCommandData(loadedCommandData))

  for (const command of loadedCommandData) {
    assert.ok(command.name.length > 0)
    assert.ok(command.description.length > 0)
    assert.ok(command.contexts?.length)
    assert.ok(command.integration_types?.length)
  }
})

test("command validation rejects duplicate command names", () => {
  const command = commandData()

  assert.throws(
    () =>
      validateCommandData([
        command,
        {
          ...command,
          description: "Duplicate ping command",
        },
      ]),
    /Duplicate command name found: \/ping/
  )
})

test("command validation rejects incomplete or mismatched metadata", () => {
  assert.throws(
    () => validateCommandData([commandData({ contexts: [] })]),
    /does not declare any interaction contexts/
  )

  assert.throws(
    () => validateCommandData([commandData({ integration_types: [] })]),
    /does not declare any installation types/
  )

  assert.throws(
    () =>
      validateCommandData([
        commandData({
          contexts: [InteractionContextType.PrivateChannel],
          integration_types: [ApplicationIntegrationType.GuildInstall],
        }),
      ]),
    /supports private channels but does not support user installation/
  )
})

test("registration target resolution is deterministic", () => {
  assert.deepEqual(resolveRegisterTarget(["node", "register", "--global"]), {
    type: "global",
  })

  assert.deepEqual(
    resolveRegisterTarget(["node", "register", "--guild"], guildId),
    {
      type: "guild",
      guildId,
    }
  )

  assert.throws(
    () =>
      resolveRegisterTarget(["node", "register", "--global", "--guild"], guildId),
    /Use either --global or --guild/
  )
})

test("global registration keeps the full command payload", () => {
  const commands = [
    commandData(),
    commandData({
      name: "profile",
      contexts: [
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ],
      integration_types: [ApplicationIntegrationType.UserInstall],
    }),
  ]

  assert.deepEqual(
    prepareCommandDataForTarget(commands, {
      type: "global",
    }),
    commands
  )
})

test("guild registration filters unsupported commands and strips global metadata", (t) => {
  t.mock.method(console, "log", () => undefined)

  const guildCommand = commandData({
    name: "help",
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
  })

  const userOnlyCommand = commandData({
    name: "profile",
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
    integration_types: [ApplicationIntegrationType.UserInstall],
  })

  assert.deepEqual(
    prepareCommandDataForTarget([guildCommand, userOnlyCommand], {
      type: "guild",
      guildId,
    }),
    [
      {
        name: "help",
        description: "Check whether Cleo is responding",
      },
    ]
  )

  assert.deepEqual(guildCommand.contexts, [
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
  ])
  assert.deepEqual(guildCommand.integration_types, [
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  ])
})

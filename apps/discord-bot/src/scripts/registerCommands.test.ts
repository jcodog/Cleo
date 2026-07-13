import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationIntegrationType,
  InteractionContextType,
  Routes,
} from "discord.js"

import type { CommandData } from "@/classes/Command"
import { loadCommands } from "@/loaders/loadCommands"

import {
  prepareCommandDataForTarget,
  registerCommands,
  resolveRegisterTarget,
  validateCommandData,
} from "./registerCommands"

const guildId = "123456789012345678"
const applicationId = "987654321098765432"

function commandData(overrides: Partial<CommandData> = {}): CommandData {
  return {
    name: "ping",
    description: "Check whether Cleo is responding",
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    ...overrides,
  }
}

function createRecordingRest(options: { failOnCall?: number } = {}) {
  const calls: {
    route: string
    body: CommandData[]
  }[] = []

  return {
    calls,
    rest: {
      async put(
        route: `/${string}`,
        request: {
          body: CommandData[]
        }
      ) {
        calls.push({
          route,
          body: request.body,
        })

        if (calls.length === options.failOnCall) {
          throw new Error("Discord REST overwrite failed.")
        }

        return request.body
      },
    },
  }
}

test("loaded command metadata is valid and unique", async () => {
  const commands = await loadCommands()
  const loadedCommandData = commands.map((command) => command.data)

  assert.deepEqual(loadedCommandData.map((command) => command.name).sort(), [
    "ban",
    "cleo",
    "help",
    "kick",
    "ping",
  ])

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
      resolveRegisterTarget(
        ["node", "register", "--global", "--guild"],
        guildId
      ),
    /Use either --global or --guild/
  )
})

test("global registration keeps the full command payload", () => {
  const commands = [
    commandData(),
    commandData({
      name: "private",
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
    name: "private",
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

test("global registration makes one complete overwrite request", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const commands = [
    commandData(),
    commandData({
      name: "private",
      contexts: [
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ],
      integration_types: [ApplicationIntegrationType.UserInstall],
    }),
  ]
  const { calls, rest } = createRecordingRest()

  await registerCommands({
    args: ["node", "register", "--global"],
    token: "token",
    applicationId,
    rest,
    commandData: commands,
  })

  assert.deepEqual(calls, [
    {
      route: Routes.applicationCommands(applicationId),
      body: commands,
    },
  ])
})

test("global registration does not issue an empty overwrite before replacement", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const commands = [commandData()]
  const { calls, rest } = createRecordingRest()

  await registerCommands({
    args: ["node", "register", "--global"],
    token: "token",
    applicationId,
    rest,
    commandData: commands,
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.body, commands)
  assert.notDeepEqual(calls[0]?.body, [])
})

test("failed global replacement is not preceded by a destructive clear", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const commands = [commandData()]
  const { calls, rest } = createRecordingRest({ failOnCall: 1 })

  await assert.rejects(
    registerCommands({
      args: ["node", "register", "--global"],
      token: "token",
      applicationId,
      rest,
      commandData: commands,
    }),
    /Discord REST overwrite failed/
  )

  assert.deepEqual(calls, [
    {
      route: Routes.applicationCommands(applicationId),
      body: commands,
    },
  ])
})

test("guild registration preserves global commands by default", async (t) => {
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
    name: "private",
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
    integration_types: [ApplicationIntegrationType.UserInstall],
  })
  const { calls, rest } = createRecordingRest()

  await registerCommands({
    args: ["node", "register", "--guild", guildId],
    token: "token",
    applicationId,
    rest,
    commandData: [guildCommand, userOnlyCommand],
  })

  assert.deepEqual(calls, [
    {
      route: Routes.applicationGuildCommands(applicationId, guildId),
      body: [
        {
          name: "help",
          description: "Check whether Cleo is responding",
        },
      ],
    },
  ])
})

test("guild registration performs explicit global cleanup after install", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const guildCommand = commandData({
    name: "help",
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
  })
  const { calls, rest } = createRecordingRest()

  await registerCommands({
    args: ["node", "register", "--guild", guildId],
    token: "token",
    applicationId,
    rest,
    commandData: [guildCommand],
    cleanupGlobalCommandsAfterGuildRegistration: true,
  })

  assert.deepEqual(calls, [
    {
      route: Routes.applicationGuildCommands(applicationId, guildId),
      body: [
        {
          name: "help",
          description: "Check whether Cleo is responding",
        },
      ],
    },
    {
      route: Routes.applicationCommands(applicationId),
      body: [],
    },
  ])
})

test("invalid payloads fail before any REST request", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const invalidPayload = createRecordingRest()

  await assert.rejects(
    registerCommands({
      args: ["node", "register", "--global"],
      token: "token",
      applicationId,
      rest: invalidPayload.rest,
      commandData: [commandData({ contexts: [] })],
    }),
    /does not declare any interaction contexts/
  )

  assert.deepEqual(invalidPayload.calls, [])

  const emptyPreparedPayload = createRecordingRest()

  await assert.rejects(
    registerCommands({
      args: ["node", "register", "--guild", guildId],
      token: "token",
      applicationId,
      rest: emptyPreparedPayload.rest,
      commandData: [
        commandData({
          contexts: [
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
          ],
          integration_types: [ApplicationIntegrationType.UserInstall],
        }),
      ],
    }),
    /No commands support the selected guild registration target/
  )

  assert.deepEqual(emptyPreparedPayload.calls, [])
})

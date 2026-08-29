import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationIntegrationType,
  InteractionContextType,
  Routes,
} from "discord.js"

import { Command, type CommandData } from "@/classes/Command"
import { loadCommands } from "@/loaders/loadCommands"

import {
  prepareCommandsForTarget,
  registerCommands,
  resolveRegisterTarget,
  validateCommands,
} from "./registerCommands"

const guildId = "123456789012345678"
const applicationId = "987654321098765432"

function makeCommand(overrides: Partial<CommandData> = {}): Command {
  const data: CommandData = {
    name: "ping",
    description: "Check whether Cleo is responding",
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    ...overrides,
  }

  return new Command({
    data,
    execute() {
      return undefined
    },
  })
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

test("loaded commands are valid Command instances with unique deployment metadata", async () => {
  const commands = await loadCommands()

  assert.deepEqual(commands.map((command) => command.data.name).sort(), [
    "ban",
    "cleo",
    "help",
    "kick",
    "ping",
  ])
  assert.ok(commands.every((command) => command instanceof Command))
  assert.doesNotThrow(() => validateCommands(commands))

  for (const command of commands) {
    assert.ok(command.data.name.length > 0)
    assert.ok(command.data.description.length > 0)
    assert.ok(command.data.contexts?.length)
    assert.ok(command.data.integration_types?.length)
    assert.equal(typeof command.execute, "function")
  }
})

test("command validation rejects entries that bypass the Command class", () => {
  const fakeCommand = {
    data: makeCommand().data,
    execute() {
      return undefined
    },
  } as Command

  assert.throws(
    () => validateCommands([fakeCommand]),
    /not a Command instance/
  )
})

test("command validation rejects duplicate command names", () => {
  const command = makeCommand()

  assert.throws(
    () =>
      validateCommands([
        command,
        makeCommand({
          description: "Duplicate ping command",
        }),
      ]),
    /Duplicate command name found: \/ping/
  )
})

test("command validation rejects incomplete or mismatched metadata", () => {
  assert.throws(
    () => validateCommands([makeCommand({ contexts: [] })]),
    /does not declare any interaction contexts/
  )

  assert.throws(
    () => validateCommands([makeCommand({ integration_types: [] })]),
    /does not declare any installation types/
  )

  assert.throws(
    () =>
      validateCommands([
        makeCommand({
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

test("global registration uses the full data from Command instances", () => {
  const commands = [
    makeCommand(),
    makeCommand({
      name: "private",
      contexts: [
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ],
      integration_types: [ApplicationIntegrationType.UserInstall],
    }),
  ]

  assert.deepEqual(
    prepareCommandsForTarget(commands, {
      type: "global",
    }),
    commands.map((command) => command.data)
  )
})

test("guild registration filters unsupported commands and strips global metadata", (t) => {
  t.mock.method(console, "log", () => undefined)

  const guildCommand = makeCommand({
    name: "help",
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
  })

  const userOnlyCommand = makeCommand({
    name: "private",
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
    integration_types: [ApplicationIntegrationType.UserInstall],
  })

  assert.deepEqual(
    prepareCommandsForTarget([guildCommand, userOnlyCommand], {
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

  assert.deepEqual(guildCommand.data.contexts, [
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
  ])
  assert.deepEqual(guildCommand.data.integration_types, [
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  ])
})

test("global registration makes one complete overwrite request from Command instances", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const commands = [
    makeCommand(),
    makeCommand({
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
    commands,
  })

  assert.deepEqual(calls, [
    {
      route: Routes.applicationCommands(applicationId),
      body: commands.map((command) => command.data),
    },
  ])
})

test("global registration does not issue an empty overwrite before replacement", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const commands = [makeCommand()]
  const { calls, rest } = createRecordingRest()

  await registerCommands({
    args: ["node", "register", "--global"],
    token: "token",
    applicationId,
    rest,
    commands,
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(
    calls[0]?.body,
    commands.map((command) => command.data)
  )
  assert.notDeepEqual(calls[0]?.body, [])
})

test("failed global replacement is not preceded by a destructive clear", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const commands = [makeCommand()]
  const { calls, rest } = createRecordingRest({ failOnCall: 1 })

  await assert.rejects(
    registerCommands({
      args: ["node", "register", "--global"],
      token: "token",
      applicationId,
      rest,
      commands,
    }),
    /Discord REST overwrite failed/
  )

  assert.deepEqual(calls, [
    {
      route: Routes.applicationCommands(applicationId),
      body: commands.map((command) => command.data),
    },
  ])
})

test("guild registration preserves global commands by default", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const guildCommand = makeCommand({
    name: "help",
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
  })
  const userOnlyCommand = makeCommand({
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
    commands: [guildCommand, userOnlyCommand],
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

  const guildCommand = makeCommand({
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
    commands: [guildCommand],
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

test("invalid commands fail before any REST request", async (t) => {
  t.mock.method(console, "log", () => undefined)

  const invalidPayload = createRecordingRest()

  await assert.rejects(
    registerCommands({
      args: ["node", "register", "--global"],
      token: "token",
      applicationId,
      rest: invalidPayload.rest,
      commands: [makeCommand({ contexts: [] })],
    }),
    /does not declare any interaction contexts/
  )

  assert.deepEqual(invalidPayload.calls, [])

  const bypassedClass = createRecordingRest()
  const fakeCommand = {
    data: makeCommand().data,
    execute() {
      return undefined
    },
  } as Command

  await assert.rejects(
    registerCommands({
      args: ["node", "register", "--global"],
      token: "token",
      applicationId,
      rest: bypassedClass.rest,
      commands: [fakeCommand],
    }),
    /not a Command instance/
  )

  assert.deepEqual(bypassedClass.calls, [])

  const emptyPreparedPayload = createRecordingRest()

  await assert.rejects(
    registerCommands({
      args: ["node", "register", "--guild", guildId],
      token: "token",
      applicationId,
      rest: emptyPreparedPayload.rest,
      commands: [
        makeCommand({
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

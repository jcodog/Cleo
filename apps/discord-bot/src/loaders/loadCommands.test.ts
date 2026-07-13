import assert from "node:assert/strict"
import { test } from "node:test"

import { loadCommandData } from "../scripts/registerCommands"
import { commandRegistry, loadCommands } from "./loadCommands"

test("runtime command loading uses the shared command registry", async () => {
  const commands = await loadCommands()

  assert.notEqual(commands, commandRegistry)
  assert.deepEqual(commands, [...commandRegistry])
  assert.deepEqual(
    commands.map((command) => command.data.name),
    ["ping", "help", "cleo", "ban", "kick"]
  )
})

test("slash command deployment uses the runtime command registry data", async () => {
  const commands = await loadCommands()
  const deployedCommandData = await loadCommandData()

  assert.deepEqual(
    deployedCommandData.map((command) => command.name),
    commands.map((command) => command.data.name)
  )
  assert.deepEqual(
    deployedCommandData,
    commands.map((command) => command.data)
  )
})

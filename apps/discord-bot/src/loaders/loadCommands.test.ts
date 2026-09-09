import assert from "node:assert/strict"
import { test } from "node:test"

import { Command } from "@/classes/Command"

import { commandRegistry, loadCommands } from "./loadCommands"

test("runtime command loading uses the shared Command instance registry", async () => {
  const commands = await loadCommands()

  assert.notEqual(commands, commandRegistry)
  assert.deepEqual(commands, [...commandRegistry])
  assert.ok(commands.every((command) => command instanceof Command))
  assert.deepEqual(
    commands.map((command) => command.data.name),
    ["ping", "cleo", "ban", "kick"]
  )
})

test("loaded commands preserve the exact registry instances used for deployment", async () => {
  const commands = await loadCommands()

  assert.equal(commands.length, commandRegistry.length)

  for (const [index, command] of commands.entries()) {
    assert.equal(command, commandRegistry[index])
    assert.ok(command instanceof Command)
  }
})

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
} from "discord.js"

import { Command } from "@/classes/Command"
import cleo from "./cleo"

test("/cleo exports a Command instance with the expected deployment metadata", () => {
  assert.ok(cleo instanceof Command)
  assert.equal(cleo.data.name, "cleo")
  assert.equal(cleo.data.description, "Inspect and manage Cleo for this server")
  assert.equal(
    cleo.data.default_member_permissions,
    PermissionFlagsBits.ManageGuild.toString()
  )
  assert.deepEqual(cleo.data.integration_types, [
    ApplicationIntegrationType.GuildInstall,
  ])
  assert.deepEqual(cleo.data.contexts, [InteractionContextType.Guild])
  assert.deepEqual(cleo.data.options, [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "status",
      description: "Check Cleo's configured services for this server",
    },
  ])
  assert.equal(typeof cleo.execute, "function")
})

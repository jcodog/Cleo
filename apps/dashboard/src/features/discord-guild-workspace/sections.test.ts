import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DISCORD_GUILD_SECTIONS,
  DISCORD_GUILD_SECTION_TITLES,
} from "./sections"

test("guild workspace sections are unique and all have labels", () => {
  assert.equal(DISCORD_GUILD_SECTIONS[0], "overview")
  assert.equal(new Set(DISCORD_GUILD_SECTIONS).size, DISCORD_GUILD_SECTIONS.length)

  for (const section of DISCORD_GUILD_SECTIONS) {
    assert.ok(DISCORD_GUILD_SECTION_TITLES[section].length > 0)
  }
})

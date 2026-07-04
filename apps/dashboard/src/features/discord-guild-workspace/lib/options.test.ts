import assert from "node:assert/strict"
import { test } from "node:test"

import {
  getChannelOptionLabel,
  getMissingRoleIds,
  getSelectedOptionState,
} from "./options"

test("channel option labels expose Discord names and type context", () => {
  assert.equal(
    getChannelOptionLabel({
      id: "123456789012345678",
      name: "moderation-log",
      type: "text",
    }),
    "#moderation-log · Text"
  )
})

test("selected option state preserves stale configured IDs", () => {
  const option = {
    id: "123456789012345678",
    name: "general",
    type: "text" as const,
  }

  assert.deepEqual(
    getSelectedOptionState([option], "123456789012345678"),
    { option, missing: false }
  )
  assert.deepEqual(getSelectedOptionState([], "123456789012345678"), {
    missing: true,
  })
  assert.deepEqual(getSelectedOptionState([], ""), { missing: false })
})

test("role option helper identifies stale roles without removing them", () => {
  assert.deepEqual(
    getMissingRoleIds(
      [{ id: "123456789012345678", name: "Support" }],
      ["123456789012345678", "999999999999999999"]
    ),
    ["999999999999999999"]
  )
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { timerConfiguration, timerMessage, timerDeadline } from "./twitchTimers"

test("timer ranges, unicode message limits and unsafe content are enforced", () => {
  const valid = {
    name: " Links ",
    enabled: true,
    intervalMinutes: 15,
    minimumMessages: 5,
    messages: ["Hello"],
  }
  assert.equal(timerConfiguration.parse(valid).name, "Links")
  for (const [key, value] of [
    ["name", ""],
    ["name", "x".repeat(81)],
    ["intervalMinutes", 4],
    ["intervalMinutes", 121],
    ["intervalMinutes", 5.5],
    ["minimumMessages", 0],
    ["minimumMessages", 101],
    ["messages", []],
    ["messages", Array(21).fill("x")],
  ])
    assert.equal(
      timerConfiguration.safeParse({ ...valid, [String(key)]: value }).success,
      false
    )
  for (const value of [
    "",
    "  ",
    "line\nbreak",
    "\u007f",
    "\u009f",
    "x".repeat(501),
  ])
    assert.equal(timerMessage.safeParse(value).success, false)
  assert.equal(timerMessage.safeParse("😀".repeat(500)).success, true)
  assert.equal(timerDeadline({ intervalMinutes: 5 }, 100), 300100)
  assert.equal(
    timerDeadline({ intervalMinutes: 5, lastAttemptAt: 500 }, 100),
    300500
  )
  assert.equal(
    timerDeadline({ intervalMinutes: 5, lastAttemptAt: 50 }, 100),
    300100
  )
})

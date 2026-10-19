import assert from "node:assert/strict"
import { test } from "node:test"
import { timerConfiguration, timerMessage, timerDeadline, eligibleTimerGroups, editedTimerCursor } from "./twitchTimers"

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
    "/foo bar",
    "  .command",
    " /me hello",
  ])
    assert.equal(timerMessage.safeParse(value).success, false)
  assert.equal(timerMessage.safeParse("😀".repeat(500)).success, true)
  assert.equal(timerMessage.safeParse(" Hello 世界. /link").success, true)
  assert.equal(timerDeadline({ intervalMinutes: 5 }, 100), 300100)
  assert.equal(
    timerDeadline({ intervalMinutes: 5, lastAttemptAt: 500 }, 100),
    300500
  )
  assert.equal(
    timerDeadline({ intervalMinutes: 5, lastAttemptAt: 50 }, 100),
    300100
  )
  assert.equal(
    timerDeadline(
      { intervalMinutes: 5, lastAttemptAt: 50, lastSentAt: 1000 },
      100
    ),
    301000
  )
})

test("eligibility retains server order and excludes a changed broadcaster", () => {
  const groups = [{ id: "old", broadcasterChanged: true }, { id: "a", broadcasterChanged: false }, { id: "b", broadcasterChanged: false }]
  assert.deepEqual(eligibleTimerGroups(groups, 1).map(g => g.id), ["a"])
  assert.equal(eligibleTimerGroups(groups, 3).length, 2)
  assert.deepEqual(eligibleTimerGroups(groups, 0), [])
  assert.deepEqual(eligibleTimerGroups(groups.slice(2), 1).map(g => g.id), ["b"])
})

test("metadata preserves the cursor and ordered message changes restart it", () => {
  const previous = { messages: ["a", "b"], cursor: 1 }
  assert.equal(editedTimerCursor(previous, ["a", "b"]), 1)
  for (const messages of [["b", "a"], ["a"], ["a", "b", "c"], ["a", "c"]])
    assert.equal(editedTimerCursor(previous, messages), 0)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { ModerationRuntime } from "./moderationRuntime"
const message = (id = "one", scopeId = "guild", content = "bad") => ({
  id,
  scopeId,
  authorId: "user",
  content,
})
const value = (revision = 1, enforcement = true) => ({
  revision,
  policyJSON: JSON.stringify({
    revision,
    rules: { blockedWords: { enabled: true, entries: [{ term: "bad" }] } },
  }),
  enforcement,
  authorityUntil: 60000,
  leaseDurationMs: 60000,
})

test("runtime supports maximum flood and duplicate thresholds for full-sized messages without retaining raw history", async () => {
  const runtime = new ModerationRuntime(async () => ({
    ...value(),
    policyJSON: JSON.stringify({
      rules: {
        duplicateMessages: { enabled: true, minimum: 256, windowMs: 300000 },
        flooding: { enabled: true, minimum: 256, windowMs: 300000 },
      },
    }),
  }))
  await runtime.load("guild", 0)
  for (let i = 0; i < 256; i++) {
    const result = runtime.inspect(
      message(String(i), "guild", "X".repeat(8192)),
      i
    )!
    assert.equal(result.decision.matched, i === 255)
    if (i === 255)
      assert.deepEqual(result.decision.ruleIds, [
        "duplicateMessages",
        "flooding",
      ])
  }
  assert.equal(
    runtime.inspect(message("rollover", "guild", "X".repeat(8192)), 256)
      ?.decision.matched,
    true
  )
  assert.equal(
    runtime.inspect(message("boundary", "guild", "x".repeat(8192)), 300001),
    null
  )
})

test("per-channel history stays isolated while guild policy is shared and withdrawal clears authority", async () => {
  let response: unknown = {
    ...value(2),
    policyJSON: JSON.stringify({
      revision: 2,
      rules: {
        duplicateMessages: { enabled: true, minimum: 2 },
        flooding: { enabled: true, minimum: 2 },
      },
    }),
  }
  let calls = 0
  const runtime = new ModerationRuntime(async () => {
    calls++
    return response
  })
  await runtime.load("guild", 0)
  assert.equal(
    runtime.inspect({ ...message("one"), historyScopeId: "channel-one" }, 1)
      ?.decision.matched,
    false
  )
  assert.equal(
    runtime.inspect({ ...message("two"), historyScopeId: "channel-two" }, 2)
      ?.decision.matched,
    false
  )
  assert.deepEqual(
    runtime.inspect({ ...message("three"), historyScopeId: "channel-one" }, 3)
      ?.decision.ruleIds,
    ["duplicateMessages", "flooding"]
  )
  assert.equal(calls, 1)
  response = null
  await runtime.load("guild", 15000)
  const withdrawn = runtime.inspect(message("withdrawn"), 15001)
  assert.equal(withdrawn?.decision.matched, false)
  assert.equal(withdrawn?.enforce, false)
})

test("slow policy refreshes use four concurrent requests and overlapping refreshes deduplicate", async () => {
  const completions: (() => void)[] = []
  let slow = false,
    active = 0,
    maximum = 0,
    calls = 0
  const runtime = new ModerationRuntime(async () => {
    if (slow) {
      calls++
      active++
      maximum = Math.max(maximum, active)
      await new Promise<void>((resolve) => completions.push(resolve))
      active--
    }
    return value()
  })
  for (let i = 0; i < 8; i++) await runtime.load(String(i), 0)
  slow = true
  const first = runtime.refresh(15000),
    second = runtime.refresh(15000)
  assert.equal(active, 4)
  assert.equal(
    runtime.inspect(message("available", "7"), 15001)?.decision.matched,
    true
  )
  completions.splice(0).forEach((resolve) => resolve())
  for (let i = 0; i < 5 && calls < 8; i++) await Promise.resolve()
  assert.equal(calls, 8)
  completions.splice(0).forEach((resolve) => resolve())
  await Promise.all([first, second])
  assert.equal(maximum, 4)
  assert.equal(calls, 8)
})

test("count summaries preserve Unicode comparison, empty messages and malformed-provider authority rules", async () => {
  let response: unknown = {
    ...value(2),
    policyJSON: JSON.stringify({
      revision: 2,
      rules: { duplicateMessages: { enabled: true, minimum: 2 } },
    }),
  }
  const runtime = new ModerationRuntime(async () => response)
  await runtime.load("guild", 0)
  assert.equal(
    runtime.inspect(message("first", "guild", "\ud800"), 1)?.decision.matched,
    false
  )
  assert.equal(
    runtime.inspect(message("second", "guild", "\ud801"), 2)?.decision.matched,
    false
  )
  assert.equal(
    runtime.inspect(message("third", "guild", "\ud800"), 3)?.decision.matched,
    true
  )
  assert.equal(
    runtime.inspect(message("empty", "guild", ""), 4)?.decision.matched,
    false
  )
  assert.equal(
    runtime.inspect(message("empty-two", "guild", ""), 5)?.decision.matched,
    true
  )
  response = undefined
  await runtime.load("guild", 15000)
  assert.equal(
    runtime.inspect(message("kept", "guild", ""), 15001)?.decision
      .policyRevision,
    2
  )
})
test("runtime caches and deduplicates refreshes without per-message reads", async () => {
  let calls = 0
  const runtime = new ModerationRuntime(async () => {
    calls++
    return value()
  })
  assert.equal(runtime.inspect(message(), 0), null)
  await Promise.all([runtime.load("guild", 0), runtime.load("guild", 0)])
  await runtime.load("guild", 1)
  assert.equal(calls, 1)
  assert.equal(runtime.inspect(message(), 1)?.decision.matched, true)
  assert.equal(runtime.inspect(message(), 2), null)
  assert.equal(runtime.inspect(message("two"), 3)?.enforce, true)
  await runtime.refresh(15000)
  assert.equal(calls, 2)
  assert.equal(runtime.inspect(message("three"), 75000)?.enforce, false)
  assert.equal(runtime.inspect(message("clock-rollback"), 1), null)
  assert.equal(runtime.inspect(message("old"), 135001), null)
  runtime.invalidate("guild")
  assert.equal(runtime.inspect(message("four"), 0), null)
})
test("runtime bounds outages, rollbacks, history and worker capacity", async () => {
  assert.throws(() => new ModerationRuntime(async () => null, 0))
  let response: unknown = value(2)
  let reject = false
  const runtime = new ModerationRuntime(async () => {
    if (reject) throw new Error("offline")
    return response
  }, 1)
  await runtime.load("guild", 0)
  response = value(1)
  await runtime.load("guild", 15000)
  assert.equal(
    runtime.inspect(message("one"), 15001)?.decision.policyRevision,
    2
  )
  reject = true
  await runtime.load("guild", 30000)
  assert.equal(runtime.inspect(message("two"), 60000)?.enforce, false)
  await runtime.refresh(300001)
  assert.equal(runtime.inspect(message("three"), 300001), null)
  reject = false
  response = null
  await runtime.load("empty", 300002)
  assert.equal(
    runtime.inspect(message("one", "empty"), 300002)?.decision.matched,
    false
  )
  response = value()
  await runtime.load("guild", 300003)
  assert.equal(runtime.inspect(message("two", "empty"), 300003), null)
  for (let i = 0; i < 70; i++)
    runtime.inspect(
      message(String(i), "guild", "x".repeat(i % 2 ? 8192 : 1)),
      300004 + i
    )
  runtime.inspect({ ...message("other", "guild"), authorId: "another" }, 300100)
  await runtime.refresh(600200)
})
test("invalidation prevents an in-flight old policy from restoring authority", async () => {
  let resolve: (v: unknown) => void = () => {}
  const runtime = new ModerationRuntime(
    () =>
      new Promise((done) => {
        resolve = done
      }),
    1
  )
  const first = runtime.load("guild", 0)
  await runtime.load("overflow", 0)
  runtime.invalidate("guild")
  resolve(value())
  await first
  assert.equal(runtime.inspect(message(), 1), null)
})

test("scope invalidation preserves unrelated refreshes and fences obsolete completions", async () => {
  const completions: ((value: unknown) => void)[] = []
  const runtime = new ModerationRuntime(
    () => new Promise((resolve) => completions.push(resolve)),
    2
  )
  const old = runtime.load("guild", 0)
  const other = runtime.load("other", 0)
  runtime.invalidate("guild")
  await runtime.load("guild", 1)
  assert.equal(completions.length, 2)
  completions[1]!(value(2))
  await other
  assert.equal(
    runtime.inspect(message("other", "other"), 2)?.decision.policyRevision,
    2
  )
  const replacement = runtime.load("guild", 1)
  completions[2]!(value(3))
  await replacement
  completions[0]!(value(1))
  await old
  assert.equal(runtime.inspect(message(), 2)?.decision.policyRevision, 3)
})

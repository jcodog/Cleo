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

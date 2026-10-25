import assert from "node:assert/strict"
import { test } from "node:test"
import { pollDiscordDiscovery } from "./pollDiscordDiscovery"

test("pending polling is bounded and never turns an unfinished checkpoint into success", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  let requests = 0
  const result = pollDiscordDiscovery(async () => {
    requests++
    return { status: "verificationPending" }
  }, new AbortController().signal)
  const rejected = assert.rejects(result, /taking longer/)
  for (let i = 0; i < 21; i++) {
    await new Promise((resolve) => setImmediate(resolve))
    t.mock.timers.tick(1000)
  }
  await rejected
  assert.equal(requests, 20)
})
test("polling cancellation cannot apply a previous identity's late response", async () => {
  const controller = new AbortController()
  let release: (value: { status: string }) => void = () => {}
  const pending = new Promise<{ status: string }>((resolve) => {
    release = resolve
  })
  const result = pollDiscordDiscovery(() => pending, controller.signal)
  controller.abort()
  release({ status: "ready" })
  await assert.rejects(result, /cancelled/)
})

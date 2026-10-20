import assert from "node:assert/strict"
import { test } from "node:test"
import {
  timerDraftKey,
  readTimerDraft,
  writeTimerDraft,
  clearTimerDraft,
} from "./timerDrafts"
import { timerConfiguration } from "@workspace/shared/twitchTimers"

test("session draft storage scopes users, broadcasters and groups and tolerates unavailable or malformed storage", () => {
  const scope = { userId: "user-a", broadcasterId: "222" }
  const key = timerDraftKey(scope, "one")!
  assert.notEqual(key, timerDraftKey({ ...scope, userId: "user-b" }, "one"))
  assert.notEqual(key, timerDraftKey({ ...scope, broadcasterId: "333" }, "one"))
  assert.notEqual(key, timerDraftKey(scope, "two"))
  assert.notEqual(key, timerDraftKey(scope))
  assert.equal(timerDraftKey(null), undefined)
  assert.equal(readTimerDraft(undefined), undefined)
  const config = {
    name: "",
    enabled: true,
    intervalMinutes: 4,
    minimumMessages: 0,
    messages: [""],
  }
  assert.equal(timerConfiguration.safeParse(config).success, false)
  const data = new Map<string, string>()
  let blocked = false
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (name: string) => {
          if (blocked) throw new Error("Storage denied")
          return data.get(name) ?? null
        },
        setItem: (name: string, value: string) => {
          if (blocked) throw new Error("Quota")
          data.set(name, value)
        },
        removeItem: (name: string) => {
          if (blocked) throw new Error("Storage denied")
          data.delete(name)
        },
      },
    },
  })
  try {
    assert.equal(writeTimerDraft(key, config, 1), true)
    assert.deepEqual(readTimerDraft(key)?.configuration, config)
    assert.equal(
      readTimerDraft(timerDraftKey({ ...scope, userId: "user-b" }, "one")),
      undefined
    )
    clearTimerDraft(key)
    assert.equal(readTimerDraft(key), undefined)
    for (const raw of [
      "not-json",
      JSON.stringify({ version: 99 }),
      "x".repeat(32001),
    ]) {
      data.set(key, raw)
      assert.equal(readTimerDraft(key), undefined)
    }
    blocked = true
    assert.equal(writeTimerDraft(key, config), false)
    assert.equal(readTimerDraft(key), undefined)
    clearTimerDraft(key)
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous)
    else Reflect.deleteProperty(globalThis, "window")
  }
})

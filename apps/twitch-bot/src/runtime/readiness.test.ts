import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import {
  checkReadiness,
  writeReadiness,
  type ReadinessState,
} from "./readiness"
import { withGrant } from "../../tests/fixtures"

test("readiness requires a fresh matching live listener process independently of subscriptions", async () => {
  await withGrant(async (_store, directory) => {
    const path = join(directory, "state.json")
    const good: ReadinessState = {
      version: 1,
      pid: process.pid,
      startedAt: 100,
      updatedAt: 1000,
      state: "ready",
    }
    const options = {
      path,
      expectedPid: process.pid,
      notBefore: 100,
      now: 1001,
    }
    await writeReadiness(path, good)
    assert.equal(await checkReadiness(options), true)
    assert.equal(
      await checkReadiness({ ...options, expectedPid: process.pid + 1 }),
      false
    )
    assert.equal(await checkReadiness({ ...options, notBefore: 101 }), false)
    assert.equal(await checkReadiness({ ...options, now: 92000 }), false)
    assert.equal(await checkReadiness({ ...options, now: 999 }), false)
    assert.equal(
      await checkReadiness({ ...options, isAlive: () => false }),
      false
    )
    for (const patch of [
      { state: "starting" },
      { state: "unhealthy" },
      { state: "stopped" },
      { updatedAt: 99 },
      { version: 2 },
    ]) {
      await writeFile(path, JSON.stringify({ ...good, ...patch }), {
        mode: 0o600,
      })
      assert.equal(await checkReadiness(options), false)
    }
    await writeReadiness(path, {
      ...good,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    })
    assert.equal(
      await checkReadiness({ path, expectedPid: process.pid, notBefore: 1 }),
      true
    )
    await writeReadiness(path, { ...good, pid: 2147483647 })
    assert.equal(
      await checkReadiness({ ...options, expectedPid: 2147483647 }),
      false
    )
  })
})

test("readiness rejects missing, malformed, oversized and directory state files", async () => {
  await withGrant(async (_store, directory) => {
    const path = join(directory, "state.json")
    const options = { path, expectedPid: process.pid, notBefore: 1 }
    assert.equal(await checkReadiness(options), false)
    await writeFile(path, "not-json", { mode: 0o600 })
    assert.equal(await checkReadiness(options), false)
    await writeFile(path, "x".repeat(4097), { mode: 0o600 })
    assert.equal(await checkReadiness(options), false)
    const folder = join(directory, "folder")
    await mkdir(folder, { mode: 0o700 })
    assert.equal(await checkReadiness({ ...options, path: folder }), false)
    await assert.rejects(
      writeReadiness(folder, {
        version: 1,
        pid: process.pid,
        startedAt: 1,
        updatedAt: 1,
        state: "starting",
      })
    )
  })
})

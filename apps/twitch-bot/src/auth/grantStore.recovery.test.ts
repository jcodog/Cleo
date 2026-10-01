import assert from "node:assert/strict"
import * as filesystem from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { test } from "node:test"

test("rotation recovery tolerates transient storage failures and blocks unsafe old-token reuse", async (t) => {
  let writeFailures = 0
  let lookupFailure: unknown
  t.mock.module("node:fs/promises", {
    exports: {
      ...filesystem,
      lstat: async (...args: Parameters<typeof filesystem.lstat>) => {
        if (String(args[0]).endsWith(".rotated") && lookupFailure !== undefined)
          throw lookupFailure
        return filesystem.lstat(...args)
      },
      open: async (...args: Parameters<typeof filesystem.open>) => {
        if (
          String(args[0]).includes(".rotated.") &&
          args[1] === "wx" &&
          writeFailures-- > 0
        )
          throw new Error("test-only recovery write unavailable")
        return filesystem.open(...args)
      },
    },
  })
  const { GrantStore } = await import("./grantStore")
  const directory = await filesystem.mkdtemp(
    join(tmpdir(), "cleo-twitch-recovery-")
  )
  await filesystem.chmod(directory, 0o700)
  const store = new GrantStore(join(directory, "bot.twitch-grant.json"))
  const grant = {
    version: 1 as const,
    clientId: "test-client",
    botUserId: "111",
    accessToken: "test-only-access",
    refreshToken: "test-only-rotated",
    expiresAt: Date.now() + 10000,
  }
  try {
    await store.write({ ...grant, refreshToken: "test-only-old" })
    await store.prepareRotation(grant)
    await assert.rejects(store.read(), /interrupted/)
    writeFailures = 2
    await store.persistRotation(grant)
    assert.equal((await store.read()).refreshToken, "test-only-rotated")

    await store.prepareRotation(grant)
    writeFailures = 3
    await assert.rejects(
      store.persistRotation(grant),
      /recovery write unavailable/
    )
    await assert.rejects(
      new GrantStore(store.path).read(),
      /old grant must not be reused/
    )
    await filesystem.unlink(`${store.path}.refreshing`)

    // A crash between marker removal and recovery-record removal remains recoverable.
    await new GrantStore(`${store.path}.rotated`).write(grant)
    await store.recoverRotation()
    assert.equal((await store.read()).refreshToken, "test-only-rotated")

    // Failed recovery cleanup retains the replacement and never falls back to old data.
    await new GrantStore(`${store.path}.rotated`).write(grant)
    await filesystem.mkdir(`${store.path}.refreshing`)
    await assert.rejects(store.recoverRotation())
    assert.equal((await store.read()).refreshToken, "test-only-rotated")
    await filesystem.rm(`${store.path}.refreshing`, { recursive: true })
    await store.recoverRotation()

    for (const error of [
      Object.assign(new Error("lookup unavailable"), { code: "EACCES" }),
      "unknown filesystem failure",
    ]) {
      lookupFailure = error
      await assert.rejects(store.read(), (value) => value === error)
    }
  } finally {
    await filesystem.rm(directory, { recursive: true, force: true })
  }
})

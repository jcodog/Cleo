import assert from "node:assert/strict"
import { test } from "node:test"
import * as filesystem from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

test("POSIX grant/readiness permissions and durable directory sync are enforced", async (t) => {
  const directory = await filesystem.mkdtemp(
    join(tmpdir(), "cleo-twitch-posix-test-")
  )
  let fileMode = 0o600
  let directoryMode = 0o700
  let parentSyncs = 0
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")
  assert.ok(originalPlatform)
  t.mock.module("node:fs/promises", {
    exports: {
      ...filesystem,
      lstat: async (...args: Parameters<typeof filesystem.lstat>) => {
        const stat = await filesystem.lstat(...args)
        return Object.assign(stat, {
          mode: (Number(stat.mode) & ~0o777) | directoryMode,
        })
      },
      open: async (
        path: string,
        ...args: Parameters<typeof filesystem.open> extends [
          unknown,
          ...infer Rest,
        ]
          ? Rest
          : never
      ) => {
        if (path === directory)
          return {
            sync: async () => {
              parentSyncs++
            },
            close: async () => undefined,
          }
        const handle = await filesystem.open(path, ...args)
        return {
          stat: async () => {
            const stat = await handle.stat()
            return Object.assign(stat, {
              mode: (stat.mode & ~0o777) | fileMode,
            })
          },
          readFile: handle.readFile.bind(handle),
          writeFile: handle.writeFile.bind(handle),
          sync: handle.sync.bind(handle),
          close: handle.close.bind(handle),
        }
      },
    },
  })
  Object.defineProperty(process, "platform", { value: "linux" })
  try {
    const { GrantStore, createGrant } = await import("./grantStore")
    const { checkReadiness, writeReadiness } =
      await import("../runtime/readiness")
    const config = {
      NODE_ENV: "test",
      TWITCH_CLIENT_ID: "test-client",
      TWITCH_CLIENT_SECRET: "test-only-secret",
      TWITCH_BOT_USER_ID: "111",
      TWITCH_BOT_GRANT_PATH: join(directory, "grant.json"),
      TWITCH_HTTP_TIMEOUT_MS: 1000,
    } as const
    const store = new GrantStore(config.TWITCH_BOT_GRANT_PATH)
    await store.write(
      createGrant(
        {
          access_token: "test-only-access",
          refresh_token: "test-only-refresh",
          expires_in: 1000,
          token_type: "bearer",
          scope: [],
        },
        config
      )
    )
    assert.equal(parentSyncs, 1)
    assert.equal((await store.read()).botUserId, "111")
    fileMode = 0o644
    await assert.rejects(store.read(), /valid private/)
    directoryMode = 0o755
    await assert.rejects(
      store.write(
        await filesystem
          .readFile(config.TWITCH_BOT_GRANT_PATH, "utf8")
          .then(JSON.parse)
      ),
      /must be private/
    )
    const path = join(directory, "state.json")
    await assert.rejects(
      writeReadiness(path, {
        version: 1,
        pid: process.pid,
        startedAt: 1,
        updatedAt: 2,
        state: "ready",
      }),
      /must be private/
    )
    directoryMode = 0o700
    await writeReadiness(path, {
      version: 1,
      pid: process.pid,
      startedAt: 1,
      updatedAt: 2,
      state: "ready",
    })
    assert.equal(
      await checkReadiness({
        path,
        expectedPid: process.pid,
        notBefore: 1,
        now: 3,
      }),
      false
    )
    fileMode = 0o600
    assert.equal(
      await checkReadiness({
        path,
        expectedPid: process.pid,
        notBefore: 1,
        now: 3,
      }),
      true
    )
    const { syncPrivateDirectory } = await import("./privateFile")
    Object.defineProperty(process, "platform", { value: "win32" })
    const syncsBeforeWindows = parentSyncs
    // Windows cannot open directory handles for fsync; it must skip that step.
    await syncPrivateDirectory(join(directory, "missing-parent", "state.json"))
    assert.equal(parentSyncs, syncsBeforeWindows)
  } finally {
    Object.defineProperty(process, "platform", originalPlatform)
    await filesystem.rm(directory, { recursive: true, force: true })
  }
})

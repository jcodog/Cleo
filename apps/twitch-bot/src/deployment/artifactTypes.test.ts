import assert from "node:assert/strict"
import * as filesystem from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

test("artifact walk rejects a filesystem entry that is neither a file nor directory", async (t) => {
  const root = await filesystem.mkdtemp(
    join(tmpdir(), "cleo-twitch-special-file-")
  )
  try {
    await filesystem.writeFile(join(root, "package.json"), "{}")
    // Model a FIFO directory entry without requiring a platform-specific mkfifo.
    t.mock.module("node:fs/promises", {
      exports: {
        ...filesystem,
        readdir: async (path: string) => {
          const entries = await filesystem.readdir(path, {
            withFileTypes: true,
          })
          return entries.map((entry) =>
            Object.assign(entry, { isFile: () => false })
          )
        },
      },
    })
    const { validateArtifact } = await import("./validateArtifact.mjs")
    await assert.rejects(
      validateArtifact(root, "a".repeat(40)),
      /regular release files/
    )
  } finally {
    await filesystem.rm(root, { recursive: true, force: true })
  }
})

import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const moduleUrl = new URL(
  "../../apps/twitch-bot/src/auth/privateFile.ts",
  import.meta.url
).href
const temporary = await mkdtemp(join(tmpdir(), "cleo-twitch-private-file-"))
try {
  const fifo = join(temporary, "test.twitch-grant.json")
  execFileSync("mkfifo", ["-m", "600", fifo])
  for (const maxBytes of [16384, 4096]) {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-", moduleUrl, fifo, String(maxBytes)],
      {
        input:
          'import assert from "node:assert/strict"; const { readPrivateJson } = await import(process.argv[2]); await assert.rejects(readPrivateJson(process.argv[3], Number(process.argv[4])), /private regular file/);',
        timeout: 2000,
        encoding: "utf8",
      }
    )
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
  }
  const { readPrivateJson, writePrivateJson } = await import(moduleUrl)
  const file = join(temporary, "state.json")
  await writePrivateJson(file, { fixture: true })
  assert.deepEqual(await readPrivateJson(file, 4096), { fixture: true })
  const link = join(temporary, "linked-state")
  await symlink(file, link)
  await assert.rejects(readPrivateJson(link, 4096))
  const publicParent = join(temporary, "public")
  execFileSync("mkdir", ["-m", "755", publicParent])
  await assert.rejects(
    writePrivateJson(join(publicParent, "state.json"), {}),
    /must be private/
  )
  await chmod(file, 0o644)
  await assert.rejects(readPrivateJson(file, 4096), /private regular file/)
  console.log(
    "Native Linux private state reads reject FIFO promptly and reject symlinks; writes enforce private directories."
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

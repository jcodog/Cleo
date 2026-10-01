import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(process.argv[2])
const guard = fileURLToPath(new URL("./twitch-no-network.mjs", import.meta.url))
function run(args, expectedStatus, message) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: {},
    encoding: "utf8",
    timeout: 5000,
  })
  assert.ifError(result.error)
  assert.equal(
    result.status,
    expectedStatus,
    `${args.join(" ")}: ${result.stderr}`
  )
  assert.doesNotMatch(
    result.stderr,
    /TWITCH_ARTIFACT_NETWORK_ATTEMPT|SyntaxError|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ReferenceError/
  )
  if (message) assert.match(result.stderr, message)
}
for (const entry of [
  "dist/index.js",
  "dist/scripts/authorizeBot.js",
  "dist/scripts/sendSmokeMessage.js",
  "dist/scripts/checkReadiness.js",
])
  run(["--check", join(root, entry)], 0)
for (const [entry, diagnostic] of [
  ["dist/index.js", /Twitch startup or runtime failed/],
  ["dist/scripts/authorizeBot.js", /Bot authorization failed/],
  ["dist/scripts/sendSmokeMessage.js", /Twitch smoke failed/],
])
  run(["--import", guard, join(root, entry)], 1, diagnostic)
run(["--import", guard, join(root, "dist/scripts/checkReadiness.js")], 1)
const temporary = await mkdtemp(join(tmpdir(), "cleo-twitch-entrypoints-"))
try {
  const path = join(temporary, "test.twitch-readiness.json")
  const now = Date.now()
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      pid: process.pid,
      startedAt: now,
      updatedAt: now,
      state: "ready",
    }),
    { mode: 0o600 }
  )
  run(
    [
      "--import",
      guard,
      join(root, "dist/scripts/checkReadiness.js"),
      path,
      String(process.pid),
      String(now),
    ],
    0
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
console.log(
  "Extracted Twitch entrypoints passed native syntax/load and fail-closed checks; no network or messages."
)

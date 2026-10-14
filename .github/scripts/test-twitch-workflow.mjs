import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
const workflow = readFileSync(
  new URL("../workflows/production-release.yml", import.meta.url),
  "utf8"
)
const twitchPackage = workflow.slice(
  workflow.indexOf("\n  twitch-package:"),
  workflow.indexOf("\n  packages-ready:")
)
const barrier = workflow.slice(
  workflow.indexOf("\n  packages-ready:"),
  workflow.indexOf("\n  backend:")
)
assert.match(
  barrier,
  /^ {10}TWITCH_ENABLED: \$\{\{ needs\.twitch-package\.outputs\.enabled \}\}$/m
)
function requireProtectedPackage(block) {
  assert.equal(
    block.match(/^ {4}environment: ([^\r\n]+)$/m)?.[1],
    "twitch-production"
  )
  assert.match(
    block,
    /^ {10}DEPLOY_ENABLED: \$\{\{ vars\.CLEO_TWITCH_DEPLOY_ENABLED \}\}$/m
  )
  assert.match(
    block,
    /^ {6}enabled: \$\{\{ steps\.gate\.outputs\.enabled \}\}$/m
  )
}
requireProtectedPackage(twitchPackage)
assert.throws(() =>
  requireProtectedPackage(
    twitchPackage.replace("    environment: twitch-production", "")
  )
)
assert.throws(() =>
  requireProtectedPackage(
    twitchPackage.replace("vars.CLEO_TWITCH_DEPLOY_ENABLED", "vars.UNPROTECTED")
  )
)
const gate = twitchPackage.match(
  /id: gate[\s\S]*?run: \|\r?\n((?: {10}[^\r\n]*\r?\n)+)/
)?.[1]
assert.ok(gate)
const script = gate
  .split(/\r?\n/)
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n")
const directory = mkdtempSync(join(tmpdir(), "cleo-gate-"))
try {
  for (const value of [
    "true",
    "TRUE",
    "True",
    "tRuE",
    "false",
    "yes",
    "1",
    "",
    " true",
    "true ",
  ]) {
    const output = join(directory, `output-${Math.random()}`)
    execFileSync("bash", ["-c", script], {
      env: { ...process.env, DEPLOY_ENABLED: value, GITHUB_OUTPUT: output },
    })
    assert.equal(
      readFileSync(output, "utf8").trim(),
      `enabled=${value.toLowerCase() === "true"}`
    )
  }
  assert.ok(
    workflow.includes(
      "TWITCH_ENABLED: ${{ needs.twitch-package.outputs.enabled }}"
    )
  )
  assert.ok(
    workflow.includes('"$TWITCH_REQUIRED" != true || "$TWITCH_ENABLED" == true')
  )
  assert.ok(workflow.includes("enabled: ${{ steps.gate.outputs.enabled }}"))
  assert.ok(
    workflow.includes("CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}")
  )
  console.log("Protected Twitch deployment-gate contract checks passed.")
} finally {
  rmSync(directory, { recursive: true, force: true })
}

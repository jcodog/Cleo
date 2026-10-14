import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
const workflow = readFileSync(
  new URL("../workflows/production-release.yml", import.meta.url),
  "utf8"
)
const gate = workflow.match(
  /id: gate[\s\S]*?run: \|\r?\n([\s\S]*?) {6}- name:/
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

import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
const workflow = readFileSync(
  new URL("../workflows/twitch-production.yml", import.meta.url),
  "utf8"
)
const gate = workflow.match(
  /id: gate[\s\S]*?run: \|\r?\n([\s\S]*?)      - name:/
)?.[1]
assert.ok(gate)
const script = gate
  .split(/\r?\n/)
  .map((line) => line.replace(/^          /, ""))
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
  for (const job of ["backend", "activate"]) {
    const block = workflow.match(
      new RegExp(`\\n  ${job}:[\\s\\S]*?(?=\\n  [a-zA-Z-]+:|$)`)
    )?.[0]
    assert.ok(
      block?.includes(
        "needs.validate-package.outputs.deploy_enabled == 'true'"
      ),
      `${job} must consume validated output`
    )
    assert.ok(block.includes("environment: twitch-production"))
  }
  assert.ok(
    workflow.includes("deploy_enabled: ${{ steps.gate.outputs.enabled }}")
  )
  assert.ok(
    workflow.includes("CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}")
  )
  console.log("Protected Twitch deployment-gate contract checks passed.")
} finally {
  rmSync(directory, { recursive: true, force: true })
}

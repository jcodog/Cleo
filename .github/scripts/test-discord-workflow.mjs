import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/**
 * Extract and compare the coordinator's real forward, recovery and rollback command shells.
 * @param {string} workflow YAML text whose fixed indentation identifies the three run blocks.
 * @returns {string[]} Registration scripts for portable checks and disposable Linux operation fixtures.
 * @throws {AssertionError} If a path is missing, freshness ordering regresses or recovery contracts diverge.
 */
export function extractCommandScripts(workflow) {
  const lines = workflow.split(/\r?\n/)
  const scripts = []
  for (let index = 0; index < lines.length; index++) {
    if (
      !/^ {6}- name: Deploy and verify (active|restored) release commands$/.test(
        lines[index]
      )
    )
      continue
    while (lines[++index] !== "        run: |") assert.ok(index < lines.length)
    const body = []
    while (
      ++index < lines.length &&
      (lines[index].startsWith("          ") || lines[index] === "")
    )
      body.push(lines[index].slice(10))
    scripts.push(body.join("\n").trim() + "\n")
  }
  assert.equal(
    scripts.length,
    3,
    "Expected forward, recovery and incident rollback command steps"
  )
  const freshnessGuard =
    'GH_TOKEN="$GH_TOKEN" "$CLEO_DISCORD_HOST_NODE" "$RUNNER_TEMP/production-policy/production-policy.mjs" recheck\n' +
    'test "$(basename "$release_root")" = "$RELEASE_SHA"\n'
  assert.ok(
    scripts[0].includes(freshnessGuard),
    "Forward registration must recheck eligibility and active SHA"
  )
  assert.ok(
    scripts[0].indexOf(freshnessGuard) <
      scripts[0].indexOf(
        'sudo -n /usr/bin/systemctl start "$CLEO_DISCORD_COMMAND_SERVICE"'
      ),
    "Reject stale releases before starting the command registration service"
  )
  assert.equal(
    scripts[0].replace(freshnessGuard, "").replace("export -n GH_TOKEN\n", ""),
    scripts[1]
  )
  assert.equal(scripts[1], scripts[2])
  return scripts
}

const coordinator = readFileSync(
  new URL("../workflows/production-release.yml", import.meta.url),
  "utf8"
).replace(/\r\n/g, "\n")
const scripts = extractCommandScripts(coordinator)
assert.throws(
  () =>
    extractCommandScripts(
      readFileSync(
        new URL("../workflows/discord-production.yml", import.meta.url),
        "utf8"
      )
    ),
  /Expected forward/
)
assert.throws(
  () =>
    extractCommandScripts(
      coordinator.replace(
        '          test "$(basename "$release_root")" = "$RELEASE_SHA"\n',
        ""
      )
    ),
  /recheck eligibility/
)

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url &&
  process.argv[2]
) {
  scripts.forEach((body, index) =>
    writeFileSync(
      path.join(process.argv[2], `workflow-commands-${index}.sh`),
      body
    )
  )
}
console.log(
  "Discord forward/recovery/rollback command contracts and freshness guards passed."
)

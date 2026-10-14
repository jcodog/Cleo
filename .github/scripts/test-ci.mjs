import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const readWorkflow = (name) =>
  Bun.YAML.parse(readFileSync(join(root, ".github/workflows", name), "utf8"))
const workflow = readWorkflow("regression.yml")
const required = [
  "code-quality",
  "web-verification",
  "tests-coverage",
  "release-verification",
]
assert.equal(workflow.name, "Regression Tests and Coverage")
assert.deepEqual(workflow.on.push.branches, ["main"])
assert.deepEqual(workflow.on.pull_request.branches, ["main"])
assert.ok("workflow_dispatch" in workflow.on)
assert.deepEqual(workflow.permissions, { contents: "read" })
assert.deepEqual(Object.keys(workflow.jobs), [...required, "regression"])
for (const id of required) {
  const job = workflow.jobs[id]
  assert.equal(job.needs, undefined, `${id} must run independently`)
  assert.equal(job.if, undefined, `${id} must run on every regression event`)
  assert.equal(
    job.environment,
    undefined,
    `${id} must not receive production access`
  )
  assert.equal(job["runs-on"], "ubuntu-24.04")
  assert.ok(job["timeout-minutes"] > 0)
  assert.doesNotMatch(JSON.stringify(job), /secrets\./)
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@")
  )
  assert.equal(
    checkout.with.ref,
    "${{ github.event.pull_request.head.sha || github.sha }}"
  )
  assert.equal(checkout.with["persist-credentials"], false)
  const bun = job.steps.find((step) =>
    step.uses?.startsWith("oven-sh/setup-bun@")
  )
  assert.equal(bun.with["bun-version-file"], "package.json")
  const node = job.steps.find((step) =>
    step.uses?.startsWith("actions/setup-node@")
  )
  assert.equal(node.with["node-version-file"], ".nvmrc")
  assert.equal(job.steps.filter((step) => step.run === "bun ci").length, 1)
}
for (const name of [
  "regression.yml",
  "publish-coverage.yml",
  "discord-production.yml",
  "twitch-production.yml",
  "discord-runner-smoke.yml",
])
  for (const job of Object.values(readWorkflow(name).jobs))
    for (const step of job.steps)
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/)

const gate = workflow.jobs.regression
for (const name of [
  "discord-production.yml",
  "twitch-production.yml",
  "discord-runner-smoke.yml",
]) {
  const production = readWorkflow(name)
  assert.equal(production.concurrency["cancel-in-progress"], false)
  for (const job of Object.values(production.jobs)) {
    assert.ok(job.if.includes("github.ref == 'refs/heads/main'"))
    if (job["runs-on"] === "cleo-prod") {
      assert.ok(
        ["discord-production", "twitch-production"].includes(job.environment)
      )
      assert.ok(
        !job.steps.some((item) => item.uses?.startsWith("actions/checkout@"))
      )
    }
  }
}
assert.equal(gate.name, "Tests, lint, typecheck, and coverage")
assert.deepEqual(gate.needs, required)
assert.equal(gate.if, "always()")
assert.equal(gate.steps.length, 1)
const step = gate.steps[0]
assert.equal(step.if, "always()")
assert.doesNotMatch(step.run, /bun|checkout|install/)
const keys = [
  "QUALITY_RESULT",
  "WEB_RESULT",
  "COVERAGE_RESULT",
  "RELEASE_RESULT",
]
keys.forEach((key, index) =>
  assert.equal(step.env[key], `\${{ needs.${required[index]}.result }}`)
)
const success = Object.fromEntries(keys.map((key) => [key, "success"]))
function checkGate(results, expected) {
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", step.run], {
    env: { ...process.env, ...results },
    encoding: "utf8",
    timeout: 10000,
  })
  assert.ifError(result.error)
  assert.equal(
    result.status,
    expected,
    `${JSON.stringify(results)}: ${result.stderr}`
  )
}
checkGate(success, 0)
for (const key of keys)
  for (const result of ["failure", "skipped", "cancelled", "", "unknown"])
    checkGate({ ...success, [key]: result }, 1)
checkGate(Object.fromEntries(keys.map((key) => [key, "cancelled"])), 1)

const publisher = readWorkflow("publish-coverage.yml")
assert.equal(publisher.name, "Publish Coverage")
assert.deepEqual(publisher.on.workflow_run, {
  workflows: [workflow.name],
  types: ["completed"],
  branches: ["main"],
})
assert.deepEqual(publisher.permissions, {})
const pages = publisher.jobs["coverage-pages"]
for (const restriction of [
  "github.repository == 'jcodog/Cleo'",
  "github.event.workflow_run.repository.full_name == github.repository",
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "github.event.workflow_run.path == '.github/workflows/regression.yml'",
  "github.event.workflow_run.head_branch == 'main'",
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.event == 'workflow_dispatch'",
  "github.event.workflow_run.conclusion == 'success'",
])
  assert.ok(pages.if.includes(restriction), restriction)
assert.deepEqual(pages.permissions, {
  actions: "read",
  contents: "read",
  pages: "write",
  "id-token": "write",
})
assert.equal(pages.environment.name, "github-pages")
assert.deepEqual(pages.concurrency, {
  group: "coverage-pages",
  "cancel-in-progress": true,
})
const download = pages.steps.find((item) =>
  item.uses?.startsWith("actions/download-artifact@")
)
assert.equal(download.with.name, "html-coverage-reports")
assert.equal(download.with["run-id"], "${{ github.event.workflow_run.id }}")
assert.equal(download.with.repository, "${{ github.repository }}")
assert.equal(download.with["digest-mismatch"], "error")
assert.ok(
  !pages.steps.some((item) => item.uses?.startsWith("actions/checkout@"))
)
const artifacts = workflow.jobs["tests-coverage"].steps.filter((item) =>
  item.uses?.startsWith("actions/upload-artifact@")
)
for (const name of ["html-coverage-reports", "cobertura-coverage-reports"])
  assert.equal(
    artifacts.find((item) => item.with.name === name)?.with[
      "if-no-files-found"
    ],
    "error"
  )
assert.equal(
  workflow.concurrency["cancel-in-progress"],
  "${{ github.event_name == 'pull_request' }}"
)

const directory = mkdtempSync(join(tmpdir(), "cleo-coverage-site-"))
const reports = [
  "apps/dashboard",
  "apps/landing",
  "apps/discord-bot",
  "apps/twitch-bot",
  "packages/backend",
  "packages/env",
  "packages/logger",
  "packages/shared",
  "packages/ui",
]
const builder = join(root, ".github/scripts/build-coverage-site.mjs")
const build = () =>
  spawnSync("node", [builder], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10000,
  })
try {
  const absent = build()
  assert.ifError(absent.error)
  assert.equal(absent.status, 1)
  assert.match(absent.stderr, /Missing or empty coverage reports/)
  for (const report of reports) {
    const folder = join(directory, "coverage", report)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, "index.html"), `<html>${report}</html>`)
    writeFileSync(join(folder, "cobertura-coverage.xml"), "<coverage />")
  }
  const result = build()
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const index = readFileSync(
    join(directory, "coverage-site/index.html"),
    "utf8"
  )
  for (const report of reports)
    assert.ok(index.includes(`./${report}/index.html`))
  const empty = join(
    directory,
    "coverage/apps/dashboard/cobertura-coverage.xml"
  )
  writeFileSync(empty, "")
  const rejected = build()
  assert.ifError(rejected.error)
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /dashboard.*cobertura-coverage.xml/)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
console.log(
  "CI topology, aggregate outcomes, trusted publishing and coverage-site checks passed."
)

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
const turbo = JSON.parse(readFileSync(join(root, "turbo.json"), "utf8"))
assert.ok(
  turbo.globalEnv.includes("NODE_OPTIONS"),
  "Node runtime flags must affect task hashes"
)
assert.ok(!turbo.globalPassThroughEnv.includes("NODE_OPTIONS"))
for (const name of ["VERCEL_URL", "NODE_EXTRA_CA_CERTS"])
  assert.ok(
    turbo.globalPassThroughEnv.includes(name),
    `${name} must remain available`
  )

/** Compare the real task graph without executing workspace tests or using cached successes. */
function testTaskHashes(nodeOptions) {
  const result = spawnSync(process.execPath, ["run", "test", "--dry=json"], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const { tasks } = JSON.parse(result.stdout)
  assert.ok(tasks.some((task) => task.taskId === "@workspace/dashboard#test"))
  return Object.fromEntries(tasks.map((task) => [task.taskId, task.hash]))
}
const unfilteredHashes = testTaskHashes("")
const filteredHashes = testTaskHashes(
  "--test-name-pattern=cache-contract-fixture"
)
assert.deepEqual(
  filteredHashes,
  testTaskHashes("--test-name-pattern=cache-contract-fixture")
)
assert.deepEqual(unfilteredHashes, testTaskHashes(""))
for (const [task, hash] of Object.entries(unfilteredHashes))
  assert.notEqual(
    hash,
    filteredHashes[task],
    `${task}: filtered and unfiltered tests must not share cached results`
  )

const cubic = Bun.YAML.parse(readFileSync(join(root, "cubic.yaml"), "utf8"))
assert.equal(cubic.reviews.enabled, true)
assert.equal(cubic.reviews.incremental_commits, true)
const exclusions = cubic.reviews.ignore.files.map(
  (pattern) => new Bun.Glob(pattern)
)
for (const file of [
  ".github/scripts/test-production-security.mjs",
  ".github/scripts/test-operations.sh",
  "ops/twitch/test.sh",
  "ops/discord/bin/deploy-discord-release.validation.test.sh",
  "scripts/example_test.mjs",
  "scripts/example-test.sh",
])
  assert.ok(
    exclusions.some((pattern) => pattern.match(file)),
    file
  )
for (const file of [
  ".github/scripts/production-policy.mjs",
  ".github/scripts/actions-condition.mjs",
  ".github/workflows/production-release.yml",
  ".github/workflows/regression.yml",
  "ops/discord/bin/deploy-discord-release",
  "ops/twitch/bin/deploy-twitch-release",
  "ops/discord/bin/check-discord-runner",
  "ops/discord/sudoers/cleo-discord-deploy",
  "apps/discord-bot/src/deployment/classifyChanges.ts",
  "cubic.yaml",
  ".coderabbit.yaml",
])
  assert.ok(!exclusions.some((pattern) => pattern.match(file)), file)
/** Parse a repository workflow as data without evaluating its Actions expressions. */
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
/** Verify exact job membership without coupling CI to YAML declaration order. */
function assertJobMembership(jobs) {
  assert.deepEqual(Object.keys(jobs).sort(), [...required, "regression"].sort())
}
assertJobMembership(workflow.jobs)
assertJobMembership(Object.fromEntries(Object.entries(workflow.jobs).reverse()))
assert.throws(() => assertJobMembership({ ...workflow.jobs, unexpected: {} }))
assert.throws(() => {
  const incomplete = { ...workflow.jobs }
  delete incomplete.regression
  assertJobMembership(incomplete)
})
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
/** Local reusable workflows share the caller commit; remote calls must be pinned. */
function requirePinned(reference) {
  if (!reference.startsWith("./")) assert.match(reference, /@[a-f0-9]{40}$/)
}
assert.throws(() =>
  requirePinned("owner/repo/.github/workflows/release.yml@main")
)
requirePinned("./.github/workflows/production-release.yml")
requirePinned(`owner/repo/.github/workflows/release.yml@${"a".repeat(40)}`)
for (const name of [
  "regression.yml",
  "publish-coverage.yml",
  "discord-production.yml",
  "twitch-production.yml",
  "discord-runner-smoke.yml",
  "production-release.yml",
])
  for (const job of Object.values(readWorkflow(name).jobs)) {
    if (job.uses) requirePinned(job.uses)
    for (const step of job.steps ?? []) if (step.uses) requirePinned(step.uses)
  }

const smoke = readWorkflow("discord-runner-smoke.yml")
assert.equal(smoke.concurrency["cancel-in-progress"], false)
assert.equal(smoke.jobs.smoke.if, "github.ref == 'refs/heads/main'")
assert.equal(smoke.jobs.smoke.environment, "discord-production")
assert.equal(smoke.jobs.smoke["runs-on"], "cleo-prod")
assert.ok(
  !smoke.jobs.smoke.steps.some((step) =>
    step.uses?.startsWith("actions/checkout@")
  )
)

const gate = workflow.jobs.regression
await import("./test-discord-workflow.mjs")
await import("./test-production-security.mjs")
await import("./test-production-policy.mjs")
await import("./test-production-workflow.mjs")
await import("./test-coordinated-release.mjs")
const archiveGuard = spawnSync(
  "bash",
  [".github/scripts/test-discord-archive-guard.sh"],
  {
    cwd: root,
    encoding: "utf8",
  }
)
assert.ifError(archiveGuard.error)
assert.equal(archiveGuard.status, 0, archiveGuard.stdout + archiveGuard.stderr)
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
/** Execute the actual aggregate shell with fixture job outcomes and assert its exit status. */
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
assert.equal(
  workflow.concurrency.group,
  "regression-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}"
)
/** Substitute fixture event metadata into the workflow's verified concurrency template. */
function concurrencyGroup({ event, prNumber, runId }) {
  return workflow.concurrency.group
    .replace("${{ github.event_name }}", event)
    .replace(
      "${{ github.event.pull_request.number || github.run_id }}",
      String(prNumber || runId)
    )
}
const firstPr = concurrencyGroup({
  event: "pull_request",
  prNumber: 250,
  runId: 101,
})
assert.equal(
  firstPr,
  concurrencyGroup({ event: "pull_request", prNumber: 250, runId: 102 })
)
assert.notEqual(
  firstPr,
  concurrencyGroup({ event: "pull_request", prNumber: 251, runId: 103 })
)
const firstMain = concurrencyGroup({ event: "push", runId: 104 })
assert.notEqual(firstMain, concurrencyGroup({ event: "push", runId: 105 }))
assert.notEqual(firstMain, firstPr)
const firstManual = concurrencyGroup({ event: "workflow_dispatch", runId: 106 })
assert.notEqual(
  firstManual,
  concurrencyGroup({ event: "workflow_dispatch", runId: 107 })
)
assert.notEqual(firstManual, firstMain)
assert.notEqual(firstManual, firstPr)

const directory = mkdtempSync(join(tmpdir(), "cleo-coverage-site-"))
const reports = [
  "apps/dashboard",
  "apps/mobile",
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
/** Run the real coverage builder in the disposable fixture and capture its outcome. */
const build = (args = []) =>
  spawnSync("node", [builder, ...args], {
    cwd: directory,
    env: {
      ...process.env,
      COVERAGE_SOURCE_SHA: "b".repeat(40),
      GITHUB_SHA: "a".repeat(40),
    },
    encoding: "utf8",
    timeout: 10000,
  })
try {
  const absent = build()
  assert.ifError(absent.error)
  assert.equal(absent.status, 1)
  assert.match(absent.stderr, /Missing, empty or invalid coverage reports/)
  // Generate the fixture with the same installed c8 reporters as workspace CI.
  const sample = join(directory, "sample.mjs")
  writeFileSync(
    sample,
    "const choose = (flag) => flag ? 1 : 2; choose(true); choose(false)\n"
  )
  const generated = spawnSync(
    "node",
    [
      join(root, "node_modules/c8/bin/c8.js"),
      "--reporter=cobertura",
      "--reporter=html",
      "--reports-dir=sample-coverage",
      "node",
      sample,
    ],
    { cwd: directory, encoding: "utf8", timeout: 20000 }
  )
  assert.ifError(generated.error)
  assert.equal(generated.status, 0, generated.stderr)
  const sampleXml = readFileSync(
    join(directory, "sample-coverage/cobertura-coverage.xml"),
    "utf8"
  )
  const sampleHtml = readFileSync(
    join(directory, "sample-coverage/index.html"),
    "utf8"
  )
  assert.match(sampleXml, /<\?xml version="1\.0"\s*\?>/)
  assert.match(
    sampleXml,
    /<!DOCTYPE coverage SYSTEM "http:\/\/cobertura\.sourceforge\.net\/xml\/coverage-04\.dtd">/
  )
  for (const report of reports) {
    const folder = join(directory, "coverage", report)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, "index.html"), sampleHtml)
    writeFileSync(join(folder, "cobertura-coverage.xml"), sampleXml)
  }
  const result = build()
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const index = readFileSync(
    join(directory, "coverage-site/index.html"),
    "utf8"
  )
  assert.ok(
    index.includes("Commit bbbbbbbbbbbb"),
    "Coverage metadata must use the checkout SHA, not the PR merge SHA"
  )
  for (const report of reports)
    assert.ok(index.includes(`./${report}/index.html`))
  const empty = join(
    directory,
    "coverage/apps/dashboard/cobertura-coverage.xml"
  )
  const validXml = readFileSync(empty, "utf8")
  const html = join(directory, "coverage/apps/dashboard/index.html")
  const validHtml = readFileSync(html, "utf8")
  // Every rejection must preserve the last complete, already built coverage site.
  /** Exercise builder rejection and ensure invalid input leaves the previous site intact. */
  function expectInvalidReport(file, content) {
    writeFileSync(file, content)
    const rejected = build()
    assert.ifError(rejected.error)
    assert.equal(rejected.status, 1)
    assert.match(
      rejected.stderr,
      /dashboard.*(cobertura-coverage\.xml|index\.html)/
    )
    assert.equal(
      readFileSync(join(directory, "coverage-site/index.html"), "utf8"),
      index
    )
  }
  expectInvalidReport(empty, "")
  expectInvalidReport(empty, validXml.replace("</coverage>", "</coverag>"))
  expectInvalidReport(empty, validXml.replace("<packages>", "<packages"))
  for (const broken of [
    validXml.replace("coverage-04.dtd", "arbitrary.dtd"),
    validXml.replace(
      'SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd"',
      'SYSTEM "file:///etc/passwd"'
    ),
    validXml.replace("<coverage ", "<?other instruction?><coverage "),
    validXml.replace(
      "<coverage ",
      '<!ENTITY secret SYSTEM "file:///etc/passwd"><coverage '
    ),
    validXml.replace(
      "<coverage ",
      '<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd"><coverage '
    ),
    validXml.replace("</coverage>", ""),
    validXml.replace(/<sources>[\s\S]*?<\/sources>/, ""),
    validXml.replace(/<packages>[\s\S]*?<\/packages>/, ""),
    validXml.replace(/<classes>[\s\S]*?<\/classes>/, "<classes/>"),
    validXml.replace(
      /<class\b[^>]*>[\s\S]*?<\/class>/,
      '<class filename="sample.mjs"/>'
    ),
    validXml.replace("</coverage>", "</coverage><coverage/>"),
    validXml.replace("</coverage>", "</coverage>outside text"),
    validXml.replace('line-rate="1"', 'line-rate="1" line-rate="1"'),
    validXml.replace("<source>", "<source>&#0;"),
    validXml.replace("<source>", "<source>&unknown;"),
    validXml.replace('<?xml version="1.0" ?>', '<?xml version="invalid" ?>'),
    validXml.replace("<!DOCTYPE coverage SYSTEM", "<!DOCTYPE other SYSTEM"),
    validXml.replace(/<line\b[^>]*\/>/, '<line number="1" hits="1"/ ></line>'),
    validXml.replace(/<line\b[^>]*\/>/, '<line number="1"hits="1"/>'),
    validXml.replace("<coverage ", "<coverage\u00a0"),
    validXml + "\u00a0",
    validXml.replace(
      /<\?xml[^>]*\?>/,
      '<?xml version="1.0" encoding="UTF-16"?>'
    ),
    validXml.replace(
      /<\?xml[^>]*\?>/,
      '<?xml version="1.0"?><?xml version="1.0"?>'
    ),
    validXml.replace(
      'coverage-04.dtd">',
      'coverage-04.dtd" [<!ENTITY secret SYSTEM "file:///etc/passwd">]>'
    ),
  ])
    expectInvalidReport(empty, broken)
  writeFileSync(empty, validXml)
  writeFileSync(
    empty,
    validXml.replace(/<\?xml[^>]*\?>/, '<?xml version="1.0" encoding="UTF-8"?>')
  )
  const encoded = build()
  assert.ifError(encoded.error)
  assert.equal(encoded.status, 0, encoded.stderr)
  writeFileSync(empty, validXml)
  expectInvalidReport(html, validHtml.slice(0, -7))
  expectInvalidReport(
    html,
    validHtml.replace('class="coverage-summary"', 'class="unrelated"')
  )
  writeFileSync(html, validHtml)
  rmSync(empty)
  const removed = build()
  assert.ifError(removed.error)
  assert.equal(removed.status, 1)
  assert.match(removed.stderr, /dashboard.*cobertura-coverage.xml/)
  assert.equal(
    readFileSync(join(directory, "coverage-site/index.html"), "utf8"),
    index
  )
  mkdirSync(empty)
  const invalid = build()
  assert.ifError(invalid.error)
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /dashboard.*cobertura-coverage.xml/)
  assert.equal(
    readFileSync(join(directory, "coverage-site/index.html"), "utf8"),
    index
  )
  rmSync(empty, { recursive: true })
  writeFileSync(empty, validXml)
  rmSync(join(directory, "coverage/apps/mobile"), { recursive: true })
  const production = build(["--production"])
  assert.equal(production.status, 0, production.stderr)
  const productionIndex = readFileSync(
    join(directory, "coverage-site/index.html"),
    "utf8"
  )
  assert.ok(!productionIndex.includes("./apps/mobile/index.html"))
  for (const report of reports.filter((path) => path !== "apps/mobile"))
    assert.ok(productionIndex.includes(`./${report}/index.html`))
  assert.equal(
    build().status,
    1,
    "Full coverage still requires the mobile report"
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}
console.log(
  "CI topology, aggregate outcomes, trusted publishing and coverage-site checks passed."
)

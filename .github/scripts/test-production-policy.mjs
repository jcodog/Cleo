import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  apiClient,
  authenticate,
  baseline,
  claim,
  invocation,
  packagesReady,
  repository,
  requiredJobs,
  verifyEvidence,
  workflowId,
} from "./production-policy.mjs"

const sha = "a".repeat(40)
const other = "b".repeat(40)
const run = {
  id: 10,
  run_attempt: 1,
  repository: { full_name: repository },
  head_repository: { full_name: repository },
  workflow_id: workflowId,
  path: ".github/workflows/regression.yml",
  name: "Regression Tests and Coverage",
  event: "push",
  head_branch: "main",
  head_sha: sha,
  status: "completed",
  conclusion: "success",
}
const workflow = { id: workflowId, path: run.path, state: "active" }
const jobs = requiredJobs.map((name) => ({
  name,
  run_id: 10,
  run_attempt: 1,
  head_sha: sha,
  status: "completed",
  conclusion: "success",
}))
const evidence = {
  run,
  workflow,
  jobs,
  mainSha: sha,
  sha,
  runId: 10,
  attempt: 1,
}
assert.deepEqual(verifyEvidence(evidence), { sha, runId: 10, attempt: 1 })
const env = {
  GITHUB_REPOSITORY: repository,
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_run",
}
const event = {
  action: "completed",
  repository: { full_name: repository },
  workflow_run: run,
}
assert.deepEqual(invocation(env, event), {
  operation: "deploy",
  sha,
  runId: 10,
  attempt: 1,
})

// Fail closed on every independent identity field and every incomplete job outcome.
export const rejectedEvidence = []
for (const patch of [
  { repository: { full_name: "attacker/Cleo" } },
  { head_repository: { full_name: "attacker/Cleo" } },
  { workflow_id: 11 },
  { path: ".github/workflows/other.yml" },
  { name: "Other workflow" },
  { event: "pull_request" },
  { event: "workflow_dispatch" },
  { head_branch: "feature" },
  { head_sha: other },
  { head_sha: "main" },
  { status: "in_progress" },
  { conclusion: "failure" },
  { conclusion: "cancelled" },
  { conclusion: "skipped" },
  { id: 20 },
  { run_attempt: 2 },
])
  rejectedEvidence.push({ ...evidence, run: { ...run, ...patch } })
for (const patch of [
  { id: 11 },
  { path: "other.yml" },
  { state: "disabled_manually" },
])
  rejectedEvidence.push({ ...evidence, workflow: { ...workflow, ...patch } })
for (const patch of [
  { sha: other },
  { sha: sha + "\n" },
  { sha: "A".repeat(40) },
  { mainSha: other },
  { runId: 11 },
  { jobs: [] },
])
  rejectedEvidence.push({ ...evidence, ...patch })
for (let index = 0; index < jobs.length; index++) {
  for (const conclusion of [
    "failure",
    "cancelled",
    "skipped",
    "neutral",
    null,
    undefined,
  ]) {
    const altered = structuredClone(jobs)
    altered[index].conclusion = conclusion
    rejectedEvidence.push({ ...evidence, jobs: altered })
  }
  for (const patch of [
    { status: "in_progress" },
    { run_id: 20 },
    { run_attempt: 2 },
    { head_sha: other },
  ]) {
    const altered = structuredClone(jobs)
    Object.assign(altered[index], patch)
    rejectedEvidence.push({ ...evidence, jobs: altered })
  }
  rejectedEvidence.push({
    ...evidence,
    jobs: jobs.filter((_, i) => i !== index),
  })
}
rejectedEvidence.push({ ...evidence, jobs: [...jobs, jobs.at(-1)] })
for (const invalid of rejectedEvidence)
  assert.throws(() => verifyEvidence(invalid))
for (const patch of [
  { GITHUB_EVENT_NAME: "pull_request" },
  { GITHUB_REPOSITORY: "fork/Cleo" },
  { GITHUB_REF: "refs/heads/feature" },
  { INPUT_OPERATION: "rollback" },
])
  assert.throws(() => invocation({ ...env, ...patch }, event))
for (const patch of [
  { repository: { full_name: "fork/Cleo" } },
  { head_repository: { full_name: "fork/Cleo" } },
  { workflow_id: 11 },
  { path: "other.yml" },
  { event: "pull_request" },
  { head_branch: "other" },
  { status: "in_progress" },
  { conclusion: "failure" },
  { head_sha: "main" },
  { id: 0 },
  { run_attempt: 0 },
])
  assert.throws(() =>
    invocation(env, { ...event, workflow_run: { ...run, ...patch } })
  )
const manual = {
  ...env,
  GITHUB_EVENT_NAME: "workflow_dispatch",
  INPUT_SHA: sha,
  INPUT_RUN_ID: "10",
  INPUT_OPERATION: "deploy",
}
assert.deepEqual(invocation(manual, {}), {
  operation: "deploy",
  sha,
  runId: 10,
})
for (const patch of [
  { INPUT_SHA: "main" },
  { INPUT_SHA: "" },
  { INPUT_RUN_ID: "" },
  { INPUT_RUN_ID: "10;deploy" },
  { INPUT_SERVICE: "untrusted" },
])
  assert.throws(() => invocation({ ...manual, ...patch }, {}))
assert.deepEqual(
  invocation({ ...manual, INPUT_OPERATION: "validate", INPUT_RUN_ID: "" }, {}),
  { operation: "validate", sha }
)
assert.deepEqual(
  invocation(
    {
      ...manual,
      INPUT_OPERATION: "rollback",
      INPUT_SERVICE: "twitch",
      INPUT_SHA: "",
      INPUT_RUN_ID: "",
    },
    {}
  ),
  { operation: "rollback" }
)
assert.throws(() =>
  invocation(
    { ...manual, INPUT_OPERATION: "rollback", INPUT_SERVICE: "both" },
    {}
  )
)

// API fixtures exercise the real read/claim implementation and record all writes.
function fixture({
  source = run,
  sourceJobs = jobs,
  main = sha,
  records = [],
  statuses = {},
} = {}) {
  const writes = []
  const requests = []
  const api = async (path, method = "GET", body) => {
    requests.push(path)
    if (method !== "GET") {
      writes.push({ path, method, body })
      if (path === "deployments") {
        const record = {
          id: 101 + records.length,
          sha: body.ref,
          payload: body.payload,
        }
        records.unshift(record)
        return record
      }
      const id = Number(path.split("/")[1])
      statuses[id] = body.state
      return body
    }
    if (path === "actions/runs/10") return source
    if (path === `actions/workflows/${workflowId}`) return workflow
    if (path.startsWith("actions/runs/10/attempts/")) {
      const page = Number(
        new URL(`https://fixture/${path}`).searchParams.get("page")
      )
      return {
        total_count: sourceJobs.length,
        jobs: sourceJobs.slice((page - 1) * 2, page * 2),
      }
    }
    if (path === "branches/main") return { commit: { sha: main } }
    if (path.startsWith("deployments?")) return records
    if (/^deployments\/\d+\/statuses/.test(path))
      return statuses[Number(path.split("/")[1])]
        ? [{ state: statuses[Number(path.split("/")[1])] }]
        : []
    throw new Error(`Unexpected API request: ${path}`)
  }
  return { api, writes, requests, records, statuses }
}
const identity = { sha, runId: 10, attempt: 1 }
const successApi = fixture()
assert.deepEqual(await authenticate(successApi.api, identity), identity)
assert.ok(successApi.requests.some((path) => path.endsWith("page=3")))
for (const invalid of rejectedEvidence) {
  const api = fixture({
    source: invalid.run,
    sourceJobs: invalid.jobs,
    main: invalid.mainSha,
  })
  // Identity/workflow-specific cases are already checked independently above.
  if (
    invalid.sha !== sha ||
    invalid.runId !== 10 ||
    invalid.workflow !== workflow
  )
    continue
  await assert.rejects(claim(api.api, identity, "backend", "deploy", "100"))
  assert.deepEqual(
    api.writes,
    [],
    "Unauthorised evidence must produce no production intent"
  )
}
const backend = fixture()
const first = await claim(backend.api, identity, "backend", "deploy", "100")
assert.equal(first.apply, true)
await assert.rejects(
  claim(backend.api, identity, "backend", "deploy", "101"),
  /uncertain/
)
assert.equal(
  backend.writes.filter((write) => write.path === "deployments").length,
  1
)
backend.statuses[first.id] = "success"
assert.deepEqual(
  await claim(backend.api, identity, "backend", "deploy", "102"),
  { id: first.id, apply: false }
)
assert.equal(
  backend.writes.filter((write) => write.path === "deployments").length,
  1
)
assert.equal(await baseline(backend.api, "backend"), sha)
backend.statuses[first.id] = "failure"
assert.equal(await baseline(backend.api, "backend"), "")
await assert.rejects(
  claim(backend.api, identity, "backend", "deploy", "103"),
  /uncertain/
)
// Only explicit operator reconciliation that no deployment occurred permits another attempt.
backend.statuses[first.id] = "inactive"
assert.equal(
  (await claim(backend.api, identity, "backend", "deploy", "104")).apply,
  true
)
const rollback = fixture({ source: { ...run, conclusion: "failure" } })
assert.equal(
  (await claim(rollback.api, { sha }, "discord", "rollback", "105")).apply,
  true
)
assert.equal(await baseline(rollback.api, "discord"), "")
assert.ok(
  !rollback.requests.some((path) => path.startsWith("actions/")),
  "Incident rollback must not depend on regression"
)
const incident = fixture({
  records: [
    {
      id: 200,
      sha,
      payload: { cleoProductionVersion: 1, operation: "rollback" },
    },
  ],
})
await assert.rejects(
  authenticate(incident.api, identity, true),
  /Incident rollback holds/
)
await assert.rejects(
  claim(incident.api, identity, "backend", "deploy", "106", true),
  /Incident rollback holds/
)
assert.deepEqual(incident.writes, [])
assert.deepEqual(
  await authenticate(incident.api, identity, false),
  identity,
  "Explicit verified manual promotion may lift an incident hold"
)
packagesReady(
  { discord: true, twitch: false },
  { discord: "success", twitch: "skipped" }
)
for (const status of ["failure", "cancelled", "skipped", "", undefined])
  assert.throws(() =>
    packagesReady(
      { discord: true, twitch: false },
      { discord: status, twitch: "skipped" }
    )
  )
assert.throws(() =>
  packagesReady(
    { discord: false, twitch: false },
    { discord: "failure", twitch: "skipped" }
  )
)
const failedHttp = apiClient("fixture", async () => ({
  ok: false,
  status: 403,
}))
await assert.rejects(failedHttp("branches/main"), /403/)
await assert.rejects(apiClient("")("branches/main"), /missing/)

// Real Git histories test net changes over multi-commit pushes and merge commits.
const directory = mkdtempSync(join(tmpdir(), "cleo-classify-"))
const classifier = fileURLToPath(
  new URL(
    "../../apps/discord-bot/src/deployment/classifyChanges.ts",
    import.meta.url
  )
)
const git = (...args) =>
  execFileSync(
    "git",
    ["-c", "maintenance.auto=false", "-c", "gc.auto=0", ...args],
    {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  ).trim()
const commit = (file, text) => {
  mkdirSync(resolve(directory, file, ".."), { recursive: true })
  writeFileSync(join(directory, file), text)
  git("add", ".")
  git(
    "-c",
    "commit.gpgsign=false",
    "-c",
    "user.name=CI Fixture",
    "-c",
    "user.email=ci@example.test",
    "commit",
    "-m",
    "fixture"
  )
  return git("rev-parse", "HEAD")
}
const classify = (mode, before, after) =>
  execFileSync(process.execPath, [classifier, mode, before, after], {
    cwd: directory,
    encoding: "utf8",
  }).trim()
try {
  git("init", "-b", "main")
  const base = commit("README.md", "fixture")
  const web = commit("apps/dashboard/page.tsx", "web")
  for (const mode of ["backend", "deploy", "twitch"])
    assert.equal(classify(mode, base, web), "false")
  const discord = commit("apps/discord-bot/src/index.ts", "discord")
  assert.equal(classify("deploy", base, discord), "true")
  assert.equal(classify("twitch", base, discord), "false")
  git("checkout", "-b", "topic")
  commit("apps/twitch-bot/src/index.ts", "twitch")
  git("checkout", "main")
  commit("apps/landing/page.tsx", "landing")
  git(
    "-c",
    "commit.gpgsign=false",
    "-c",
    "user.name=CI Fixture",
    "-c",
    "user.email=ci@example.test",
    "merge",
    "--no-ff",
    "topic",
    "-m",
    "fixture merge"
  )
  const merge = git("rev-parse", "HEAD")
  assert.equal(classify("twitch", discord, merge), "true")
  assert.equal(classify("deploy", discord, merge), "false")
  assert.equal(classify("backend", base, merge), "false")
  const backendSha = commit("packages/backend/convex/schema.ts", "backend")
  for (const mode of ["backend", "deploy", "twitch"]) {
    assert.equal(classify(mode, merge, backendSha), "true")
    assert.equal(classify(mode, "", backendSha), "true")
    assert.equal(classify(mode, other, backendSha), "true")
    assert.equal(
      classify(mode, backendSha, merge),
      "true",
      "Non-ancestor baseline is conservative"
    )
  }
  const workflowSha = commit(
    ".github/workflows/production-release.yml",
    "workflow"
  )
  for (const mode of ["backend", "deploy", "twitch"])
    assert.equal(classify(mode, backendSha, workflowSha), "true")
  for (const args of [
    ["unknown", base, web],
    ["backend", "--all", web],
    ["deploy", base, "HEAD"],
  ]) {
    const result = spawnSync(process.execPath, [classifier, ...args], {
      cwd: directory,
      encoding: "utf8",
    })
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout, "")
  }
  // New configuration files must conservatively classify instead of crashing on git show.
  const config = commit("packages/env/package.json", "{}")
  assert.equal(classify("backend", workflowSha, config), "true")
  assert.ok(readFileSync(classifier, "utf8").includes('"-z"'))
} finally {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
console.log(
  `Production policy, ${rejectedEvidence.length} rejected evidence fixtures, receipt idempotency, package barriers, rollback independence and real Git classification passed.`
)

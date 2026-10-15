import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  apiClient,
  authenticate,
  baseline,
  claim,
  finishClaim,
  releaseClaim,
  receipts,
  invocation,
  packagesReady,
  repository,
  requiredJobs,
  verifyEvidence,
  workflowId,
} from "./production-policy.mjs"

/** Remove ambient deployment credentials before any disposable Git, classifier or policy subprocess. */
function fixtureEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        !["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY"].includes(
          key.toUpperCase()
        )
    )
  )
}
const childEnvironment = fixtureEnvironment({
  ...process.env,
  GH_TOKEN: "ambient-fixture",
  GITHUB_TOKEN: "ambient-fixture",
  CONVEX_DEPLOY_KEY: "ambient-fixture",
})
for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY"])
  assert.equal(childEnvironment[key], undefined)

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
  AUTO_PROMOTION_ENABLED: "true",
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
  { AUTO_PROMOTION_ENABLED: "" },
  { AUTO_PROMOTION_ENABLED: "false" },
  { AUTO_PROMOTION_ENABLED: " true" },
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
  INPUT_RUN_ATTEMPT: "1",
  INPUT_OPERATION: "deploy",
}
assert.deepEqual(invocation(manual, {}), {
  operation: "deploy",
  sha,
  runId: 10,
  attempt: 1,
})
for (const patch of [
  { INPUT_SHA: "main" },
  { INPUT_SHA: "" },
  { INPUT_RUN_ID: "" },
  { INPUT_RUN_ID: "10;deploy" },
  { INPUT_RUN_ATTEMPT: "" },
  { INPUT_RUN_ATTEMPT: "0" },
  { INPUT_RUN_ATTEMPT: "1;deploy" },
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
/**
 * Model GitHub receipt/run APIs in memory, preserving accepted writes and current status.
 * @param {object} options Trusted or negative source evidence and pre-existing receipt history.
 * @returns {object} API transport plus recorded reads/writes/state for failure-order assertions.
 */
function fixture({
  source = run,
  sourceJobs = jobs,
  main = sha,
  records = [],
  statuses = {},
} = {}) {
  const writes = []
  const requests = []
  /** Apply each accepted API write before returning, so wrappers can lose only the response. */
  const api = async (path, method = "GET", body) => {
    requests.push(path)
    if (method !== "GET") {
      writes.push({ path, method, body })
      if (path === "deployments") {
        const record = {
          id: Math.max(100, ...records.map((record) => record.id)) + 1,
          sha: body.ref,
          payload: body.payload,
          task: body.task,
          environment: body.environment,
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
    if (/^deployments\/\d+$/.test(path))
      return records.find((record) => record.id === Number(path.split("/")[1]))
    if (path.startsWith("deployments?")) {
      const query = new URL(`https://fixture/${path}`).searchParams
      const perPage = Number(query.get("per_page") || 30)
      const page = Number(query.get("page") || 1)
      return records
        .filter(
          (record) =>
            (!query.has("task") || record.task === query.get("task")) &&
            (!query.has("environment") ||
              record.environment === query.get("environment")) &&
            (!query.has("sha") || record.sha === query.get("sha"))
        )
        .sort((a, b) => b.id - a.id)
        .slice((page - 1) * perPage, page * perPage)
    }
    if (/^deployments\/\d+\/statuses/.test(path))
      return statuses[Number(path.split("/")[1])]
        ? [{ state: statuses[Number(path.split("/")[1])] }]
        : []
    throw new Error(`Unexpected API request: ${path}`)
  }
  return { api, writes, requests, records, statuses }
}
const identity = { sha, runId: 10, attempt: 1 }
// Query fixtures obey real filters; another runtime or historical SHA cannot suppress Convex.
const mixed = fixture({
  records: [
    {
      id: 1000,
      sha,
      task: "cleo-backend",
      environment: "unprotected",
      payload: { cleoProductionVersion: 1, operation: "deploy" },
    },
    {
      id: 900,
      sha,
      task: "cleo-twitch",
      environment: "twitch-production",
      payload: { cleoProductionVersion: 1, operation: "deploy" },
    },
    {
      id: 800,
      sha,
      task: "cleo-discord",
      environment: "discord-production",
      payload: { cleoProductionVersion: 1, operation: "deploy" },
    },
    {
      id: 700,
      sha: "b".repeat(40),
      task: "cleo-backend",
      environment: "discord-production",
      payload: { cleoProductionVersion: 1, operation: "deploy" },
    },
  ],
  statuses: { 1000: "success", 900: "success", 800: "success", 700: "success" },
})
assert.equal(
  (await claim(mixed.api, identity, "backend", "deploy", "100")).apply,
  true
)
for (const component of ["backend", "discord", "twitch"]) {
  const latest = await receipts(mixed.api, component)
  assert.equal(latest.length, 1)
  assert.equal(latest[0].task, `cleo-${component}`)
}
for (const key of ["task", "environment", "sha"]) {
  const record = {
    id: 1,
    sha,
    task: "cleo-backend",
    environment: "discord-production",
  }
  record[key] = "untrusted"
  await assert.rejects(
    receipts(async () => [record], "backend", sha),
    /Wrong receipt/
  )
}
const history = fixture({
  records: Array.from({ length: 250 }, (_, index) => ({
    id: 1000 - index,
    sha: index < 149 ? "b".repeat(40) : sha,
    task: "cleo-backend",
    environment: "discord-production",
    payload: { cleoProductionVersion: 1, operation: "deploy" },
  })),
  statuses: Object.fromEntries(
    Array.from({ length: 250 }, (_, index) => [
      1000 - index,
      index === 249 ? "success" : "inactive",
    ])
  ),
})
assert.equal(await baseline(history.api, "backend"), "")
assert.equal(
  history.requests.filter((path) => path.startsWith("deployments?")).length,
  1
)
assert.match(history.requests[0], /per_page=1&page=1$/)
history.requests.length = 0
assert.deepEqual(
  await claim(history.api, identity, "backend", "deploy", "100"),
  { id: 751, apply: false }
)
const queries = history.requests.filter((path) =>
  path.startsWith("deployments?")
)
assert.equal(queries.length, 2)
assert.ok(queries.every((path) => path.includes(`&sha=${sha}&per_page=100`)))
await assert.rejects(
  receipts(async () => {
    throw new Error("API unavailable")
  }, "backend"),
  /API unavailable/
)
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
const unused = fixture()
const unusedClaim = await claim(
  unused.api,
  identity,
  "backend",
  "deploy",
  "100"
)
unused.records[0].environment = "unprotected"
await assert.rejects(
  releaseClaim(unused.api, identity, unusedClaim.id, "100"),
  /Wrong receipt environment/
)
unused.records[0].environment = "discord-production"
await assert.rejects(
  releaseClaim(unused.api, identity, unusedClaim.id, "other-run")
)
for (const alteredIdentity of [
  { ...identity, sha: "b".repeat(40) },
  { ...identity, runId: 11 },
  { ...identity, attempt: 2 },
])
  await assert.rejects(
    releaseClaim(unused.api, alteredIdentity, unusedClaim.id, "100")
  )
assert.equal(unused.statuses[unusedClaim.id], "in_progress")
unused.statuses[unusedClaim.id] = "success"
await assert.rejects(
  releaseClaim(unused.api, identity, unusedClaim.id, "100"),
  /completed claim/
)
unused.statuses[unusedClaim.id] = "in_progress"
await releaseClaim(unused.api, identity, unusedClaim.id, "100")
assert.equal(unused.statuses[unusedClaim.id], "inactive")
assert.equal(
  (await claim(unused.api, identity, "backend", "deploy", "101")).apply,
  true
)
const misleading = fixture({
  records: [
    {
      id: 900,
      sha,
      task: "cleo-backend",
      environment: "discord-production",
      payload: { cleoProductionVersion: 1, operation: "rollback" },
    },
  ],
  statuses: { 900: "success" },
})
await assert.rejects(
  claim(misleading.api, identity, "backend", "deploy", "100"),
  /does not record a deployment/
)
assert.deepEqual(misleading.writes, [])
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
      task: "cleo-discord",
      environment: "discord-production",
      payload: { cleoProductionVersion: 1, operation: "rollback" },
    },
  ],
})
// Full runtime and recovery lifecycles use actual API writes and owner checks.
for (const component of ["discord", "twitch"]) {
  for (const operation of ["deploy", "rollback"]) {
    for (const state of ["success", "failure"]) {
      const api = fixture()
      const owner = {
        component,
        operation,
        coordinatorRun: "500",
        coordinatorAttempt: "2",
      }
      const intent = await claim(
        api.api,
        identity,
        component,
        operation,
        "500",
        false,
        "2"
      )
      assert.equal(api.statuses[intent.id], "in_progress")
      for (const patch of [
        { coordinatorRun: "501" },
        { coordinatorAttempt: "3" },
        { component: "backend" },
        { operation: operation === "deploy" ? "rollback" : "deploy" },
      ])
        await assert.rejects(
          finishClaim(
            api.api,
            identity,
            intent.id,
            { ...owner, ...patch },
            state
          )
        )
      const writesBefore = api.writes.length
      /** Reject before persistence; this must remain distinct from an accepted-but-unacknowledged write. */
      const unavailable = async (...args) => {
        if (args[1] === "POST") throw new Error("API unavailable")
        return api.api(...args)
      }
      await assert.rejects(
        finishClaim(unavailable, identity, intent.id, owner, state),
        /API unavailable/
      )
      assert.equal(api.writes.length, writesBefore)
      assert.equal(
        api.statuses[intent.id],
        "in_progress",
        "Pre-write failure leaves the unfinished claim uncertain"
      )
      assert.equal(await baseline(api.api, component), "")
      await finishClaim(api.api, identity, intent.id, owner, state)
      assert.equal(api.statuses[intent.id], state)
      assert.equal(
        await baseline(api.api, component),
        operation === "deploy" && state === "success" ? sha : ""
      )
      await assert.rejects(
        finishClaim(api.api, identity, intent.id, owner, "success"),
        /completed/
      )
      if (operation === "rollback") {
        await assert.rejects(
          authenticate(api.api, identity, true),
          /Incident rollback holds/
        )
        const repeated = await claim(
          api.api,
          identity,
          component,
          operation,
          "501",
          false,
          "1"
        )
        assert.notEqual(repeated.id, intent.id)
        assert.equal(api.statuses[repeated.id], "in_progress")
      }
    }
  }
  const unusedRuntime = fixture()
  const intent = await claim(
    unusedRuntime.api,
    identity,
    component,
    "deploy",
    "600"
  )
  await assert.rejects(
    releaseClaim(unusedRuntime.api, identity, intent.id, "other", component)
  )
  await releaseClaim(unusedRuntime.api, identity, intent.id, "600", component)
  assert.equal(unusedRuntime.statuses[intent.id], "inactive")
  assert.equal(await baseline(unusedRuntime.api, component), "")
}
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
// GitHub can persist a terminal status before losing its response in transit.
// The caller fails; subsequent reads must reject overwriting that completed receipt.
for (const component of ["backend", "discord", "twitch"]) {
  for (const operation of component === "backend"
    ? ["deploy"]
    : ["deploy", "rollback"]) {
    for (const state of ["success", "failure"]) {
      const api = fixture()
      const owner = {
        component,
        operation,
        coordinatorRun: "800",
        coordinatorAttempt: "1",
      }
      const intent = await claim(api.api, identity, component, operation, "800")
      const writesBefore = api.writes.length
      /** Apply GitHub's mutation first, then lose its acknowledgement without undoing server state. */
      const lostResponse = async (...args) => {
        const response = await api.api(...args)
        if (args[1] === "POST")
          throw new Error("Response lost after status persisted")
        return response
      }
      await assert.rejects(
        finishClaim(lostResponse, identity, intent.id, owner, state),
        /Response lost/
      )
      assert.equal(api.writes.length, writesBefore + 1)
      assert.equal(api.statuses[intent.id], state)
      assert.equal(
        await baseline(api.api, component),
        operation === "deploy" && state === "success" ? sha : ""
      )
      for (const nextState of ["success", "failure"])
        await assert.rejects(
          finishClaim(api.api, identity, intent.id, owner, nextState),
          /completed/
        )
      assert.equal(
        api.writes.length,
        writesBefore + 1,
        "Retry must not repeat a persisted status mutation"
      )
      if (component === "backend") {
        if (state === "success")
          assert.deepEqual(
            await claim(api.api, identity, component, operation, "801"),
            { id: intent.id, apply: false }
          )
        else
          await assert.rejects(
            claim(api.api, identity, component, operation, "801"),
            /uncertain/
          )
        assert.equal(
          api.writes.length,
          writesBefore + 1,
          "Persisted backend result prevents another Convex claim"
        )
      }
      if (operation === "rollback")
        await assert.rejects(
          authenticate(api.api, identity, true),
          /Incident rollback holds/
        )
    }
  }
}
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
/** Run Git only inside the disposable history, disabling background maintenance for deterministic cleanup. */
const git = (...args) =>
  execFileSync(
    "git",
    ["-c", "maintenance.auto=false", "-c", "gc.auto=0", ...args],
    {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnvironment,
    }
  ).trim()
/** Build artificial history with unsigned fixture-only commits; repository commits retain configured signing. */
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
/** Execute the real classifier against fixture commits and return its exact conservative boolean output. */
const classify = (mode, before, after, failure = "") =>
  execFileSync("node", [classifier, mode, before, after], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...childEnvironment,
      NODE_OPTIONS: `--import=${pathToFileURL(join(directory, "git-faults.mjs")).href}`,
      CLASSIFIER_GIT_FAILURE: failure,
    },
  }).trim()
try {
  git("init", "-b", "main")
  writeFileSync(
    join(directory, "git-faults.mjs"),
    `
    import assert from "node:assert/strict"
    import child from "node:child_process"
    import { syncBuiltinESMExports } from "node:module"
    for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY"]) assert.equal(process.env[key], undefined)
    const execute = child.execFileSync
    child.execFileSync = (file, args, options) => {
      if (file === "git" && args[0] === process.env.CLASSIFIER_GIT_FAILURE) throw new Error("Fixture Git failure: " + args[0])
      return execute(file, args, options)
    }
    syncBuiltinESMExports()
  `
  )
  const base = commit("README.md", "fixture")
  const defaultClassification = spawnSync("node", [classifier], {
    cwd: directory,
    encoding: "utf8",
    env: childEnvironment,
  })
  assert.equal(defaultClassification.status, 0, defaultClassification.stderr)
  assert.equal(defaultClassification.stdout, "true")
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
  assert.throws(
    () => classify("deploy", discord, merge, "diff"),
    /Fixture Git failure: diff/
  )
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
    const result = spawnSync("node", [classifier, ...args], {
      cwd: directory,
      encoding: "utf8",
      env: childEnvironment,
    })
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout, "")
  }
  // New configuration files must conservatively classify instead of crashing on git show.
  const config = commit("packages/env/package.json", "{}")
  assert.equal(classify("backend", workflowSha, config), "true")
  const exportsBase = commit(
    "packages/env/package.json",
    '{"exports":{"./backend":"./src/backend.ts","./landing":"./src/old.ts"}}'
  )
  const exportsWeb = commit(
    "packages/env/package.json",
    '{"exports":{"./backend":"./src/backend.ts","./landing":"./src/new.ts"}}'
  )
  assert.equal(classify("backend", exportsBase, exportsWeb), "false")
  assert.equal(
    classify("backend", exportsBase, exportsWeb, "show"),
    "true",
    "Snapshot API failure must be conservative"
  )
  assert.equal(classify("backend", exportsBase, exportsWeb, "cat-file"), "true")
  assert.equal(
    classify("backend", exportsBase, exportsWeb, "merge-base"),
    "true"
  )
  const unknownWorkspace = commit("packages/future-runtime/package.json", "{}")
  for (const mode of ["backend", "deploy", "twitch"])
    assert.equal(classify(mode, exportsWeb, unknownWorkspace), "true")
  assert.ok(readFileSync(classifier, "utf8").includes('"-z"'))
} finally {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}

// Run the real planner with a read-only API fixture. A queued manual request
// cannot classify a newer release using an older checked-out workflow policy.
const cliDirectory = mkdtempSync(join(tmpdir(), "cleo-policy-cli-"))
try {
  const root = fileURLToPath(new URL("../../", import.meta.url))
  const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    env: childEnvironment,
  }).trim()
  const mock = join(cliDirectory, "api.mjs")
  const evidencePath = join(cliDirectory, "evidence.json")
  const eventPath = join(cliDirectory, "event.json")
  const outputPath = join(cliDirectory, "output")
  const summaryPath = join(cliDirectory, "summary")
  writeFileSync(eventPath, "{}")
  writeFileSync(
    mock,
    `
    import { readFileSync } from "node:fs"
    const fixture = JSON.parse(readFileSync(process.env.POLICY_TEST_EVIDENCE, "utf8"))
    globalThis.fetch = async (url, options) => {
      for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY"])
        if (process.env[key] !== undefined) throw new Error("Policy retained child credential: " + key)
      if (options.method !== "GET") throw new Error("Planner attempted a production mutation")
      const path = new URL(url).pathname
      let data
      if (path.endsWith("/actions/runs/10")) data = fixture.run
      else if (path.endsWith("/actions/workflows/${workflowId}")) data = fixture.workflow
      else if (path.endsWith("/jobs")) data = { jobs: fixture.jobs, total_count: fixture.jobs.length }
      else if (path.endsWith("/branches/main")) data = { commit: { sha: fixture.sha } }
      else if (path.endsWith("/deployments")) data = []
      else throw new Error("Unexpected GitHub fixture request")
      return Response.json(data)
    }
  `
  )
  /** Invoke the real planner CLI with read-only API evidence, capturing outputs to detect identity divergence. */
  const invoke = (operation, fixtureSha, environment = {}) => {
    writeFileSync(
      evidencePath,
      JSON.stringify({
        run: { ...run, head_sha: fixtureSha },
        workflow,
        jobs: jobs.map((job) => ({ ...job, head_sha: fixtureSha })),
        sha: fixtureSha,
      })
    )
    writeFileSync(outputPath, "")
    return spawnSync(
      "node",
      [
        "--import",
        pathToFileURL(mock).href,
        join(root, ".github/scripts/production-policy.mjs"),
        "plan",
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...childEnvironment,
          ...manual,
          INPUT_OPERATION: operation,
          INPUT_SHA: fixtureSha,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          GITHUB_STEP_SUMMARY: summaryPath,
          GH_TOKEN: "read-only-fixture",
          POLICY_TEST_EVIDENCE: evidencePath,
          ...environment,
        },
      }
    )
  }
  const divergent = invoke("deploy", sha)
  assert.ifError(divergent.error)
  assert.notEqual(divergent.status, 0)
  assert.match(divergent.stderr, /Workflow policy checkout differs/)
  assert.equal(readFileSync(outputPath, "utf8"), "")
  for (const operation of ["validate", "deploy"]) {
    const result = invoke(operation, checkoutSha)
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    const output = readFileSync(outputPath, "utf8")
    assert.ok(output.includes(`sha=${checkoutSha}\n`))
    assert.ok(output.includes(`backend=${operation === "deploy"}\n`))
  }
  const sanitised = invoke("validate", checkoutSha, {
    GITHUB_TOKEN: "explicit-dummy",
    CONVEX_DEPLOY_KEY: "explicit-dummy",
  })
  assert.equal(sanitised.status, 0, sanitised.stderr)
  // Exercise the real rollback CLI with no source regression identity at all.
  // Its receipt identifies recovery intent at main, not the restored artifact.
  const ownerMock = join(cliDirectory, "receipt-api.mjs")
  const statePath = join(cliDirectory, "receipt-state.json")
  writeFileSync(
    ownerMock,
    `
    import { readFileSync, writeFileSync } from "node:fs"
    globalThis.fetch = async (url, options) => {
      for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "CONVEX_DEPLOY_KEY"])
        if (process.env[key] !== undefined) throw new Error("Receipt CLI retained credential: " + key)
      const state = JSON.parse(readFileSync(process.env.POLICY_TEST_STATE, "utf8"))
      const path = new URL(url).pathname
      if (path.endsWith("/deployments/900") && options.method === "GET") return Response.json(state.record)
      if (path.endsWith("/deployments/900/statuses")) {
        if (options.method === "POST") { state.status = JSON.parse(options.body).state; state.writes++; writeFileSync(process.env.POLICY_TEST_STATE, JSON.stringify(state)); if (process.env.POLICY_LOST_RESPONSE === "true") throw new Error("Response lost after persistence"); return Response.json({}) }
        return Response.json([{ state: state.status }])
      }
      throw new Error("Unexpected receipt API request")
    }
  `
  )
  for (const state of ["success", "failure"]) {
    for (const responseLost of [false, true]) {
      writeFileSync(
        statePath,
        JSON.stringify({
          record: {
            id: 900,
            sha: checkoutSha,
            task: "cleo-discord",
            environment: "discord-production",
            payload: {
              cleoProductionVersion: 1,
              operation: "rollback",
              sourceRun: 0,
              sourceAttempt: 0,
              coordinatorRun: "700",
              coordinatorAttempt: "2",
            },
          },
          status: "in_progress",
          writes: 0,
        })
      )
      writeFileSync(summaryPath, "")
      /** Retry the exact CLI invocation to prove persisted terminal state cannot be overwritten after response loss. */
      const complete = () =>
        spawnSync(
          "node",
          [
            "--import",
            pathToFileURL(ownerMock).href,
            join(root, ".github/scripts/production-policy.mjs"),
            "complete",
          ],
          {
            cwd: root,
            encoding: "utf8",
            timeout: 10000,
            env: {
              ...childEnvironment,
              ...manual,
              INPUT_OPERATION: "rollback",
              INPUT_SERVICE: "discord",
              RELEASE_SHA: checkoutSha,
              SOURCE_RUN_ID: "",
              SOURCE_ATTEMPT: "",
              GITHUB_RUN_ID: "700",
              GITHUB_RUN_ATTEMPT: "2",
              COMPONENT: "discord",
              RECEIPT_ID: "900",
              RECEIPT_STATE: state,
              GITHUB_EVENT_PATH: eventPath,
              GITHUB_STEP_SUMMARY: summaryPath,
              GH_TOKEN: "receipt-fixture",
              POLICY_TEST_STATE: statePath,
              POLICY_LOST_RESPONSE: String(responseLost),
            },
          }
        )
      const result = complete()
      assert.ifError(result.error)
      assert.equal(result.status, responseLost ? 1 : 0, result.stderr)
      const persisted = JSON.parse(readFileSync(statePath, "utf8"))
      assert.equal(persisted.status, state)
      assert.equal(persisted.writes, 1)
      if (responseLost) {
        assert.match(result.stderr, /Response lost/)
        assert.equal(
          readFileSync(summaryPath, "utf8"),
          "",
          "Lost acknowledgement must not print a success summary"
        )
        const retried = complete()
        assert.equal(retried.status, 1)
        assert.match(retried.stderr, /completed claim/)
        assert.equal(JSON.parse(readFileSync(statePath, "utf8")).writes, 1)
        assert.equal(readFileSync(summaryPath, "utf8"), "")
      }
    }
  }
} finally {
  await rm(cliDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
console.log(
  `Production policy, ${rejectedEvidence.length} rejected evidence fixtures, receipt idempotency, package barriers, rollback independence and real Git classification passed.`
)

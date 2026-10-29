import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  backendHealth,
  backendPreflight,
  stageWeb,
  promoteWeb,
  verifyProject,
  verifyWebDeployment,
  releaseResult,
  authenticate,
  poll,
} from "./production-policy.mjs"
import { evaluate } from "./actions-condition.mjs"
import { spawnSync } from "node:child_process"

const sha = "a".repeat(40)
const other = "b".repeat(40)
const projectId = "prj_test"
const deploymentId = "dpl_test"
const url = "https://release-test.convex.cloud"
const project = {
  id: projectId,
  name: "cleo",
  autoAssignCustomDomains: false,
  link: {
    type: "github",
    org: "jcodog",
    repo: "Cleo",
    productionBranch: "main",
  },
  targets: {
    production: { id: "dpl_previous", meta: { githubCommitSha: other } },
  },
}
const deployment = {
  id: deploymentId,
  projectId,
  target: "production",
  meta: { githubCommitSha: sha },
  readyState: "READY",
  readySubstate: "STAGED",
  aliasAssigned: false,
}
const noPause = async () => {}
const recheck = async () => {}

/** Provider model applies writes before responding, including lost promotion responses. */
function provider({ failed = false, lost = false, current = false } = {}) {
  const p = structuredClone(project)
  const d = structuredClone(deployment)
  if (current) {
    p.targets.production = d
    d.aliasAssigned = true
    d.readySubstate = "PROMOTED"
  }
  const writes = []
  const api = async (path, method = "GET", body) => {
    if (method !== "GET") writes.push({ path, method, body })
    if (path === `/v9/projects/${projectId}`) {
      if (method === "PATCH") Object.assign(p, body)
      return structuredClone(p)
    }
    if (path.startsWith("/v6/deployments")) return { deployments: [] }
    if (path === "/v13/deployments") {
      assert.equal(body.gitSource.sha, sha)
      assert.equal(body.gitSource.ref, sha)
      assert.equal(body.target, "production")
      return structuredClone(d)
    }
    if (path === `/v13/deployments/${deploymentId}`) return structuredClone(d)
    if (path.includes("/promote/")) {
      if (failed) throw new Error("Promotion rejected")
      p.targets.production = structuredClone(d)
      p.autoAssignCustomDomains = true
      d.aliasAssigned = true
      d.readySubstate = "PROMOTED"
      if (lost) throw new Error("Lost response after alias assignment")
      return null
    }
    throw new Error(`Unexpected provider path ${path}`)
  }
  return { api, writes, p, d }
}

let fixture = provider()
const staged = await stageWeb(fixture.api, projectId, sha, recheck, noPause)
assert.equal(staged.state, "staged")
assert.equal(fixture.writes.length, 1)
assert.notEqual(fixture.p.targets.production.id, deploymentId)
const reuse = provider()
const reuseApi = async (path, ...args) =>
  path.startsWith("/v6/deployments")
    ? { deployments: [{ ...deployment, id: undefined, uid: deploymentId }] }
    : reuse.api(path, ...args)
assert.equal(
  (await stageWeb(reuseApi, projectId, sha, recheck, noPause)).id,
  deploymentId
)
assert.equal(
  reuse.writes.length,
  0,
  "Provider list UIDs must reuse the immutable artifact"
)
await assert.rejects(
  stageWeb(
    async (path, ...args) =>
      path.startsWith("/v6/deployments")
        ? { deployments: [{ ...deployment, readySubstate: "PROMOTED" }] }
        : reuse.api(path, ...args),
    projectId,
    sha,
    recheck,
    noPause
  ),
  /previously served/
)
assert.throws(() =>
  verifyProject(
    { ...project, rootDirectory: "apps/landing" },
    projectId,
    "apps/dashboard"
  )
)
await assert.rejects(
  poll(
    async () => ({ readyState: "READY", checksConclusion: "failed" }),
    () => true,
    noPause
  ),
  /checks failed/
)
assert.equal(
  await promoteWeb(fixture.api, staged, recheck, noPause),
  "deployed"
)
assert.equal(fixture.p.targets.production.id, deploymentId)
assert.equal(fixture.p.autoAssignCustomDomains, false)
const before = fixture.writes.length
assert.equal(
  await promoteWeb(fixture.api, staged, recheck, noPause),
  "already-current"
)
assert.equal(
  fixture.writes.length,
  before,
  "Recovery must not promote a current deployment again"
)
assert.equal(
  (await stageWeb(fixture.api, projectId, sha, recheck, noPause)).state,
  "already-current"
)

for (const options of [{ failed: true }, { lost: true }]) {
  fixture = provider(options)
  await assert.rejects(promoteWeb(fixture.api, staged, recheck, noPause))
  assert.equal(fixture.p.autoAssignCustomDomains, false)
  if (options.lost)
    assert.equal(
      await promoteWeb(fixture.api, staged, recheck, noPause),
      "already-current"
    )
  else assert.equal(fixture.p.targets.production.id, "dpl_previous")
}
fixture = provider()
await assert.rejects(
  promoteWeb(
    fixture.api,
    staged,
    async () => {
      throw new Error("Stale main SHA")
    },
    noPause
  ),
  /Stale main/
)
assert.equal(fixture.writes.length, 0)
await assert.rejects(
  stageWeb(
    fixture.api,
    projectId,
    sha,
    async () => {
      throw new Error("Stale main SHA")
    },
    noPause
  ),
  /Stale main/
)
assert.equal(fixture.writes.length, 0)

for (const patch of [
  { autoAssignCustomDomains: true },
  { autoAssignCustomDomains: undefined },
  { id: "prj_other" },
  { link: { ...project.link, repo: "other" } },
  { link: { ...project.link, productionBranch: "develop" } },
])
  assert.throws(() => verifyProject({ ...project, ...patch }, projectId))
for (const patch of [
  { projectId: "prj_other" },
  { target: "preview" },
  { meta: { githubCommitSha: other } },
  { readyState: "ERROR" },
  { checksConclusion: "failed" },
  { checksState: "running" },
  { checksState: "completed" },
  { aliasError: { code: "FAILED" } },
])
  assert.throws(() =>
    verifyWebDeployment({ ...deployment, ...patch }, projectId, sha)
  )
await assert.rejects(
  poll(
    async () => ({ readyState: "ERROR" }),
    () => true,
    noPause
  ),
  /failed/
)
await assert.rejects(
  poll(
    async () => ({ readyState: "BUILDING" }),
    () => false,
    noPause,
    2
  ),
  /timed out/
)

const health = async (_url, options) => {
  assert.equal(options.redirect, "error")
  assert.equal(options.headers.authorization, undefined)
  assert.equal(JSON.parse(options.body).path, "releaseHealth:read")
  return Response.json({ status: "success", value: { healthy: true, sha } })
}
await backendHealth(url, sha, health)
for (const value of [
  { status: "error" },
  { status: "success", value: { healthy: false, sha } },
  { status: "success", value: { healthy: true, sha: other } },
  { status: "success", value: { healthy: true, sha: null } },
])
  await assert.rejects(
    backendHealth(url, sha, async () => Response.json(value))
  )
for (const bad of [
  "http://release-test.convex.cloud",
  "https://example.com",
  `${url}/other`,
  `${url}?token=secret`,
])
  await assert.rejects(backendHealth(bad, sha, health))
const missingHealth = async () => new Response("missing", { status: 404 })
await assert.rejects(
  backendPreflight(
    {
      url: "https://example.com",
      base: other,
      sha,
      event: "workflow_dispatch",
      bootstrap: sha,
    },
    missingHealth
  )
)
for (const event of ["workflow_run", "workflow_dispatch"]) {
  await assert.rejects(
    backendPreflight({ url, base: other, sha, event }, missingHealth),
    /unverified/
  )
  await assert.rejects(
    backendPreflight(
      { url, base: other, sha, event, bootstrap: other },
      missingHealth
    ),
    /unverified/
  )
}
assert.equal(
  await backendPreflight(
    { url, base: other, sha, event: "workflow_dispatch", bootstrap: sha },
    missingHealth
  ),
  "bootstrap"
)
await assert.rejects(
  backendPreflight(
    { url, base: other, sha, event: "workflow_run", bootstrap: sha },
    missingHealth
  ),
  /unverified/
)
// Existing source evidence may be green, but an unsigned commit still cannot authorise a mutation.
await assert.rejects(
  authenticate(
    async (path) => {
      if (path.startsWith("actions/runs/") && path.includes("/jobs"))
        return { jobs: [], total_count: 0 }
      if (path.startsWith("commits/"))
        return { sha, commit: { verification: { verified: false } } }
      if (path.startsWith("actions/")) return { run_attempt: 1 }
      throw new Error(path)
    },
    { sha, runId: 1, attempt: 1 }
  ),
  /GitHub Verified/
)

const readWorkflow = (name) =>
  Bun.YAML.parse(
    readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8")
  )
const release = readWorkflow("production-release.yml")
const native = readWorkflow("mobile-validation.yml")
const regression = readWorkflow("regression.yml")
const scripts = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
).scripts
for (const name of [
  "typecheck:production",
  "lint:production",
  "test:coverage:production",
])
  assert.match(scripts[name], /--filter=!@workspace\/mobile/)
assert.ok(!scripts["test:ci:production"].includes("test:mobile"))
const nativeChecks = native.jobs.expo.steps.find(
  (step) => step.name === "Native types, lint, tests and coverage"
).run
for (const name of ["typecheck", "lint", "test:coverage"])
  assert.ok(nativeChecks.includes(`@workspace/mobile ${name}`))
assert.ok(
  regression.jobs["tests-coverage"].steps.some((step) =>
    step.run?.includes("build-coverage-site.mjs --production")
  )
)
assert.equal(release.jobs["release-result"].if, "always()")
assert.ok(release.jobs["release-result"].needs.includes("web-promote"))
assert.ok(release.jobs.backend.needs.includes("web-stage"))
assert.match(release.jobs.backend.if, /needs.web-stage.result == 'success'/)
for (const id of Object.keys(release.jobs))
  if (id !== "release-result")
    assert.ok(
      release.jobs["release-result"].needs.includes(id),
      `${id} omitted from final result`
    )
assert.ok(
  native.jobs.expo.steps.some((step) => step.run?.includes("check:expo"))
)
assert.ok(!native.jobs.expo.steps.some((step) => step["continue-on-error"]))
assert.doesNotMatch(
  JSON.stringify(regression),
  /check:expo|@workspace\/mobile build/
)
assert.ok(
  !release.on.workflow_run.workflows.includes(native.name),
  "Failed Expo cannot block or authorise unrelated releases"
)
const nativeShell = native.jobs.expo.steps.find((step) =>
  step.run?.includes("check:expo")
).run
for (const status of [0, 1]) {
  const result = spawnSync(
    "bash",
    [
      "-e",
      "-c",
      `bun() { if [[ "$*" == *check:expo* ]]; then return ${status}; fi; echo exported; };\n${nativeShell}`,
    ],
    { encoding: "utf8" }
  )
  assert.ifError(result.error)
  assert.equal(result.status, status)
  assert.equal(result.stdout.includes("exported"), status === 0)
}
for (const app of ["dashboard", "landing"])
  assert.equal(
    JSON.parse(
      readFileSync(
        new URL(`../../apps/${app}/vercel.json`, import.meta.url),
        "utf8"
      )
    ).git.deploymentEnabled.main,
    false
  )

/** Drive the actual production graph conditions, including legitimate skipped activations. */
const needs = {
  rollout: { result: "success", outputs: { enabled: "true" } },
  authorise: {
    result: "success",
    outputs: { discord: "true", twitch: "true" },
  },
  "web-stage": { result: "success" },
  backend: { result: "success", outputs: { backend: "deployed" } },
  "discord-activate": { result: "success", outputs: { discord: "deployed" } },
  "twitch-activate": { result: "success", outputs: { twitch: "deployed" } },
  "discord-current": { result: "skipped" },
  "twitch-current": { result: "skipped" },
  "web-promote": {
    result: "success",
    outputs: { dashboard: "deployed", landing: "deployed" },
  },
}
assert.equal(releaseResult(needs, "deploy").state, "deployed")
assert.equal(
  releaseResult(
    { ...needs, rollout: { outputs: { enabled: "false" } } },
    "deploy"
  ).state,
  "held"
)
for (const id of [
  "backend",
  "discord-activate",
  "twitch-activate",
  "web-stage",
])
  for (const result of ["failure", "cancelled", "skipped"]) {
    const altered = { ...needs, [id]: { result } }
    assert.equal(
      evaluate(release.jobs["web-promote"].if, { needs: altered }, [result]),
      false
    )
  }
const unchanged = structuredClone(needs)
for (const component of ["discord", "twitch"]) {
  unchanged.authorise.outputs[component] = "false"
  unchanged[`${component}-activate`] = { result: "skipped" }
  unchanged[`${component}-current`] = { result: "success" }
}
assert.equal(
  evaluate(release.jobs["web-promote"].if, { needs: unchanged }, [
    "success",
    "skipped",
  ]),
  true
)
assert.equal(
  releaseResult(unchanged, "deploy").states.discord,
  "already-current"
)
assert.equal(
  releaseResult(
    {
      ...needs,
      "web-promote": { result: "failure", outputs: { dashboard: "deployed" } },
    },
    "deploy"
  ).state,
  "partial"
)
assert.equal(
  releaseResult({ rollout: needs.rollout }, "deploy").state,
  "failed",
  "Skipped stages must never imply deployment"
)
assert.equal(
  releaseResult({ ...needs, "web-promote": { result: "failure" } }, "deploy")
    .state,
  "partial"
)
assert.equal(
  releaseResult(
    { rollout: needs.rollout, "discord-rollback": { result: "success" } },
    "rollback"
  ).state,
  "recovered"
)
console.log(
  "Coordinated release health, staging, promotion, trust, hold, partial-state and recovery fixtures passed."
)

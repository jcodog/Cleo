import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export const repository = "jcodog/Cleo"
export const workflowId = 310957278
export const requiredJobs = [
  "Code quality",
  "Web verification",
  "Tests and coverage",
  "Release verification",
  "Tests, lint, typecheck, and coverage",
]
const environments = {
  backend: "discord-production",
  discord: "discord-production",
  twitch: "twitch-production",
  dashboard: "vercel-production",
  landing: "vercel-production",
}
const shaPattern = /^[a-f0-9]{40}$(?![\s\S])/

/**
 * Authenticate one complete push-to-main regression using GitHub API evidence.
 * @param {object} evidence Run/workflow records, all attempt jobs, expected identity and fresh main SHA.
 * @returns {{sha:string,runId:number,attempt:number}} The exact authenticated source identity.
 * @throws {AssertionError} On stale, missing, ambiguous, untrusted or incomplete evidence; never grants partial approval.
 */
export function verifyEvidence({
  run,
  workflow,
  jobs,
  mainSha,
  sha,
  runId,
  attempt,
}) {
  assert.match(sha, shaPattern, "Invalid release SHA")
  assert.equal(run.id, Number(runId), "Source run identity differs")
  if (attempt)
    assert.equal(run.run_attempt, Number(attempt), "Source attempt changed")
  assert.equal(run.repository?.full_name, repository, "Wrong repository")
  assert.equal(
    run.head_repository?.full_name,
    repository,
    "Wrong originating repository"
  )
  assert.equal(run.workflow_id, workflowId, "Wrong workflow identity")
  assert.equal(workflow.id, workflowId)
  assert.equal(workflow.path, ".github/workflows/regression.yml")
  assert.equal(workflow.state, "active")
  assert.equal(run.path, workflow.path, "Wrong source workflow path")
  assert.equal(run.name, "Regression Tests and Coverage")
  assert.equal(
    run.event,
    "push",
    "Only trusted main pushes authorise production"
  )
  assert.equal(run.head_branch, "main")
  assert.equal(run.head_sha, sha, "Source run SHA differs")
  assert.equal(run.status, "completed")
  assert.equal(run.conclusion, "success")
  assert.equal(mainSha, sha, "Release superseded by current main")
  for (const name of requiredJobs) {
    const matching = jobs.filter((job) => job.name === name)
    assert.equal(
      matching.length,
      1,
      `Missing or ambiguous required job: ${name}`
    )
    const [job] = matching
    assert.equal(job.run_id, run.id)
    assert.equal(job.run_attempt, run.run_attempt)
    assert.equal(job.head_sha, sha)
    assert.equal(job.status, "completed", `${name} incomplete`)
    assert.equal(job.conclusion, "success", `${name} did not succeed`)
  }
  return { sha, runId: run.id, attempt: run.run_attempt }
}

/**
 * Validate the coordinator's event and manual inputs before accessing credentials.
 * @param {object} env GitHub context, explicit manual inputs and the default-off automatic flag.
 * @param {object} event Parsed GitHub event; automatic releases require a trusted completed push.
 * @returns {object} Selected operation and source identity; rollback deliberately needs no regression.
 * @throws {AssertionError} For unsupported callers, disabled automatic promotion or malformed selections.
 */
export function invocation(env, event) {
  assert.equal(env.GITHUB_REPOSITORY, repository)
  assert.equal(env.GITHUB_REF, "refs/heads/main")
  const operation = env.INPUT_OPERATION || "deploy"
  assert.ok(["validate", "deploy", "rollback"].includes(operation))
  assert.ok(["both", "discord", "twitch"].includes(env.INPUT_SERVICE || "both"))
  if (env.GITHUB_EVENT_NAME === "workflow_run") {
    assert.equal(
      env.AUTO_PROMOTION_ENABLED?.toLowerCase(),
      "true",
      "Automatic production promotion is disabled"
    )
    assert.equal(operation, "deploy")
    assert.equal(event.action, "completed")
    assert.equal(event.repository?.full_name, repository)
    const run = event.workflow_run
    assert.equal(run?.repository?.full_name, repository)
    assert.equal(run?.head_repository?.full_name, repository)
    assert.equal(run?.workflow_id, workflowId)
    assert.equal(run?.path, ".github/workflows/regression.yml")
    assert.equal(run?.event, "push")
    assert.equal(run?.head_branch, "main")
    assert.equal(run?.status, "completed")
    assert.equal(run?.conclusion, "success")
    assert.match(run?.head_sha ?? "", shaPattern)
    assert.ok(Number.isSafeInteger(run.id) && run.id > 0)
    assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0)
    return {
      operation,
      sha: run.head_sha,
      runId: run.id,
      attempt: run.run_attempt,
    }
  }
  assert.equal(
    env.GITHUB_EVENT_NAME,
    "workflow_dispatch",
    "Untrusted invocation"
  )
  if (operation === "rollback") {
    assert.ok(["discord", "twitch"].includes(env.INPUT_SERVICE))
    return { operation }
  }
  assert.match(env.INPUT_SHA ?? "", shaPattern, "Select an explicit main SHA")
  if (operation === "validate") return { operation, sha: env.INPUT_SHA }
  assert.match(
    env.INPUT_RUN_ID ?? "",
    /^[1-9][0-9]*$/,
    "Select a regression run ID"
  )
  assert.match(
    env.INPUT_RUN_ATTEMPT ?? "",
    /^[1-9][0-9]*$/,
    "Select an explicit regression attempt"
  )
  return {
    operation,
    sha: env.INPUT_SHA,
    runId: Number(env.INPUT_RUN_ID),
    attempt: Number(env.INPUT_RUN_ATTEMPT),
  }
}

/**
 * Create an API caller confined to this repository, with redirects disabled.
 * @param {string} token Credential captured in the client, never logged or returned.
 * @param {Function} fetcher HTTP transport, injectable for offline failure fixtures.
 * @returns {Function} JSON request function; rejects missing credentials, transport errors and non-success responses.
 */
export function apiClient(token, fetcher = fetch) {
  return async (path, method = "GET", body) => {
    assert.ok(token, "GitHub token missing")
    const response = await fetcher(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
        redirect: "error",
      }
    )
    assert.ok(response.ok, `GitHub ${method} ${path}: ${response.status}`)
    return response.json()
  }
}

/**
 * Re-read run/job evidence, incident intent and current main before promotion.
 * @param {Function} api Repository-scoped API client; job evidence is fully paginated.
 * @param {object} identity Exact source SHA, run ID and attempt already selected by the caller.
 * @param {boolean} automatic Whether a rollback hold must block this invocation.
 * @returns {Promise<object>} Authenticated identity; API errors and superseded attempts reject without mutation.
 */
export async function authenticate(api, identity, automatic = false) {
  const run = await api(`actions/runs/${identity.runId}`)
  const workflow = await api(`actions/workflows/${workflowId}`)
  const jobs = []
  for (let page = 1; ; page++) {
    const result = await api(
      `actions/runs/${identity.runId}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`
    )
    assert.ok(Array.isArray(result.jobs))
    jobs.push(...result.jobs)
    if (jobs.length >= result.total_count) break
    assert.ok(result.jobs.length > 0, "Incomplete job evidence")
  }
  if (automatic) {
    for (const component of ["discord", "twitch"]) {
      const [latest] = await receipts(api, component)
      assert.ok(
        latest?.payload.operation !== "rollback" || latest.sha !== identity.sha,
        "Incident rollback holds this revision; use explicit verified manual deployment or a newer main"
      )
    }
  }
  const commit = await api(`commits/${identity.sha}`)
  assert.equal(commit.sha, identity.sha, "Commit identity differs")
  assert.equal(
    commit.commit?.verification?.verified,
    true,
    "GitHub Verified commit required"
  )
  const branch = await api("branches/main")
  return verifyEvidence({
    ...identity,
    run,
    workflow,
    jobs,
    mainSha: branch.commit?.sha,
  })
}

/**
 * Read the newest component receipt, or paginate only one SHA's backend reuse history.
 * @param {Function} api Repository-scoped API client.
 * @param {string} component Supported backend, Discord or Twitch receipt task/environment.
 * @param {string} [sha] Exact release SHA for backend deduplication; omitted for bounded latest-state checks.
 * @returns {Promise<object[]>} Newest-first matching receipts; invalid or cross-component responses reject.
 */
export async function receipts(api, component, sha) {
  assert.ok(Object.hasOwn(environments, component))
  if (sha !== undefined) assert.match(sha, shaPattern)
  const perPage = sha === undefined ? 1 : 100
  const records = []
  for (let page = 1; ; page++) {
    const batch = await api(
      `deployments?task=cleo-${component}&environment=${environments[component]}${sha === undefined ? "" : `&sha=${sha}`}&per_page=${perPage}&page=${page}`
    )
    assert.ok(Array.isArray(batch))
    assert.ok(batch.length <= perPage, "Oversized receipt response")
    for (const record of batch) {
      assert.equal(record.task, `cleo-${component}`, "Wrong receipt component")
      assert.equal(
        record.environment,
        environments[component],
        "Wrong receipt environment"
      )
      if (sha !== undefined) assert.equal(record.sha, sha, "Wrong receipt SHA")
      assert.ok(Number.isSafeInteger(record.id) && record.id > 0)
      if (records.length)
        assert.ok(records.at(-1).id > record.id, "Receipt order changed")
      records.push(record)
    }
    if (sha === undefined || batch.length < perPage) break
  }
  return records
}

/**
 * Read a schema-checked receipt's latest status without assuming missing confirmation is success.
 * @param {Function} api Repository-scoped API client.
 * @param {object} record Custom receipt with a supported schema and valid intent SHA.
 * @returns {Promise<string>} Latest status, conservatively pending when no status exists; API failures reject.
 */
export async function receiptState(api, record) {
  assert.equal(
    record.payload?.cleoProductionVersion,
    1,
    "Unrecognised deployment receipt"
  )
  assert.match(record.sha, shaPattern)
  const statuses = await api(`deployments/${record.id}/statuses?per_page=1`)
  return statuses[0]?.state ?? "pending"
}

/**
 * Select a comparison baseline only from the latest confirmed forward deployment.
 * @param {Function} api Repository-scoped API client.
 * @param {string} component Component whose outstanding changes will be classified.
 * @returns {Promise<string>} Confirmed SHA, or empty for unknown/failed/rollback intent; errors reject planning.
 */
export async function baseline(api, component) {
  const [latest] = await receipts(api, component)
  if (!latest) return ""
  return latest.payload.operation === "deploy" &&
    (await receiptState(api, latest)) === "success"
    ? latest.sha
    : ""
}

/**
 * Record production intent before mutation, authenticating every forward deployment.
 * @param {Function} api Repository-scoped API client with receipt-write permission.
 * @param {object} identity Source identity; rollback records recovery intent at observed main instead.
 * @param {string} component Backend or runtime task; backend supports deployment only.
 * @param {string} operation Forward deploy or controlled incident rollback.
 * @param {string} coordinatorRun Owner run ID, paired with its attempt for later updates.
 * @param {boolean} automatic Enforce incident holds for automatic releases.
 * @param {string} coordinatorAttempt Owner attempt; an older rerun cannot finish another attempt's claim.
 * @returns {Promise<{id:number,apply:boolean}>} New intent, or apply=false for an already successful same-SHA backend.
 * @throws {AssertionError} For invalid evidence or an uncertain backend outcome; never retries Convex blindly.
 */
export async function claim(
  api,
  identity,
  component,
  operation,
  coordinatorRun,
  automatic = false,
  coordinatorAttempt = "1",
  proof = {}
) {
  assert.ok(Object.hasOwn(environments, component))
  assert.match(String(coordinatorRun), /^[1-9][0-9]*$/)
  assert.match(String(coordinatorAttempt), /^[1-9][0-9]*$/)
  if (operation === "deploy") await authenticate(api, identity, automatic)
  else assert.equal(operation, "rollback")
  if (component === "backend") {
    assert.equal(operation, "deploy")
    for (const record of await receipts(api, component, identity.sha)) {
      assert.equal(
        record.payload?.operation,
        "deploy",
        "Backend receipt does not record a deployment"
      )
      const state = await receiptState(api, record)
      if (state === "success") return { id: record.id, apply: false }
      assert.equal(
        state,
        "inactive",
        "Backend outcome uncertain; reconcile receipt before retrying"
      )
    }
  }
  const record = await api("deployments", "POST", {
    ref: identity.sha,
    task: `cleo-${component}`,
    environment: environments[component],
    auto_merge: false,
    required_contexts: [],
    production_environment: true,
    payload: {
      cleoProductionVersion: 1,
      operation,
      sourceRun: identity.runId ?? 0,
      sourceAttempt: identity.attempt ?? 0,
      coordinatorRun,
      coordinatorAttempt,
      proof,
    },
    description: `${component} ${operation} authorised by production coordinator`,
  })
  assert.ok(Number.isSafeInteger(record.id), "Deployment claim missing")
  await api(`deployments/${record.id}/statuses`, "POST", {
    state: "in_progress",
    auto_inactive: false,
  })
  return { id: record.id, apply: true }
}

/**
 * Persist a status only after matching the receipt's complete immutable ownership tuple.
 * @param {Function} api Repository-scoped API client.
 * @param {object} identity Expected intent SHA and source run/attempt.
 * @param {number|string} receiptId Existing receipt ID; no arbitrary task can be updated.
 * @param {object} owner Component, operation, coordinator run/attempt and intended terminal state.
 * @returns {Promise<void>} Resolves only after GitHub acknowledges the status mutation.
 * @throws {Error} On ownership mismatch, completed status or API failure, including a response lost after persistence.
 */
async function updateReceipt(
  api,
  identity,
  receiptId,
  { component, operation, coordinatorRun, coordinatorAttempt, state }
) {
  assert.ok(Object.hasOwn(environments, component))
  assert.ok(["deploy", "rollback"].includes(operation))
  assert.match(String(receiptId), /^[1-9][0-9]*$/)
  const record = await api(`deployments/${receiptId}`)
  assert.equal(record.task, `cleo-${component}`)
  assert.equal(
    record.environment,
    environments[component],
    "Wrong receipt environment"
  )
  assert.equal(record.sha, identity.sha)
  assert.equal(record.payload?.operation, operation)
  assert.equal(String(record.payload?.coordinatorRun), String(coordinatorRun))
  assert.equal(
    String(record.payload?.coordinatorAttempt),
    String(coordinatorAttempt)
  )
  assert.equal(record.payload?.sourceRun, identity.runId ?? 0)
  assert.equal(record.payload?.sourceAttempt, identity.attempt ?? 0)
  assert.ok(
    ["pending", "in_progress"].includes(await receiptState(api, record)),
    "Cannot release a completed claim"
  )
  await api(`deployments/${receiptId}/statuses`, "POST", {
    state,
    auto_inactive: false,
    description:
      state === "inactive"
        ? "Authorisation rejected before production mutation started"
        : `${component} ${operation}: confirmed ${state}`,
  })
}

/**
 * Mark an owned forward claim inactive only in a proven pre-mutation rejection branch.
 * @param {Function} api Repository-scoped API client.
 * @param {object} identity Expected source SHA/run/attempt.
 * @param {number|string} receiptId Unfinished claim belonging to this coordinator.
 * @param {string} coordinatorRun Owner run ID.
 * @param {string} component Backend or runtime whose controller has not started.
 * @param {string} coordinatorAttempt Owner attempt.
 * @returns {Promise<void>} Acknowledged release; callers must preserve uncertainty after any mutation starts or API loss.
 */
export async function releaseClaim(
  api,
  identity,
  receiptId,
  coordinatorRun,
  component = "backend",
  coordinatorAttempt = "1"
) {
  await updateReceipt(api, identity, receiptId, {
    component,
    operation: "deploy",
    coordinatorRun,
    coordinatorAttempt,
    state: "inactive",
  })
}

/**
 * Record a confirmed controller/verification outcome without changing completed history.
 * @param {Function} api Repository-scoped API client.
 * @param {object} identity Expected source or rollback-intent identity.
 * @param {number|string} receiptId Owned unfinished receipt.
 * @param {object} owner Component, operation and coordinator run/attempt.
 * @param {string} state Confirmed success or failure, never a guess after interruption.
 * @returns {Promise<void>} Acknowledged terminal update; rejected or lost responses propagate to the workflow.
 */
export async function finishClaim(api, identity, receiptId, owner, state) {
  assert.ok(
    ["success", "failure"].includes(state),
    "Unconfirmed receipt outcome"
  )
  await updateReceipt(api, identity, receiptId, { ...owner, state })
}

/**
 * Enforce the package barrier against the authenticated component plan.
 * @param {object} plan Boolean Discord/Twitch requirements from the source planner.
 * @param {object} results Actual dependency conclusions, including skipped/cancelled results.
 * @returns {void} Only selected success and unselected skipped results are accepted.
 * @throws {AssertionError} If any required package is missing or its result differs from the plan.
 */
export function packagesReady(plan, results) {
  for (const component of ["discord", "twitch"]) {
    assert.equal(
      results[component],
      plan[component] ? "success" : "skipped",
      `${component} packaging did not match the authorised plan`
    )
  }
}

/** Validate the configured production target even during an authorised bootstrap. */
function convexOrigin(url) {
  const origin = new URL(url)
  assert.equal(origin.protocol, "https:")
  assert.match(origin.hostname, /^[a-z0-9-]+\.convex\.cloud$/)
  assert.equal(origin.pathname, "/")
  assert.equal(
    origin.search +
      origin.hash +
      origin.username +
      origin.password +
      origin.port,
    ""
  )
  return origin.origin
}

/** Read a deployed Convex query, including a database read and a code-baked revision. */
export async function backendHealth(url, expectedSha, fetcher = fetch) {
  const origin = convexOrigin(url)
  assert.match(expectedSha, shaPattern, "Backend baseline is unknown")
  const response = await fetcher(`${origin}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "releaseHealth:read",
      args: {},
      format: "json",
    }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  })
  assert.ok(response.ok, "Backend health request failed")
  const result = await response.json()
  assert.equal(result.status, "success", "Backend health query failed")
  assert.equal(result.value?.healthy, true)
  assert.equal(
    result.value?.sha,
    expectedSha,
    "Running Convex SHA differs from receipt"
  )
}

/** Only an explicit manual current-SHA bootstrap can replace unverified manual state. */
export async function backendPreflight(
  { url, base, bootstrap, sha, event },
  fetcher = fetch
) {
  convexOrigin(url)
  try {
    await backendHealth(url, base, fetcher)
    return "verified"
  } catch (error) {
    assert.ok(
      event === "workflow_dispatch" &&
        bootstrap === sha &&
        shaPattern.test(sha),
      `${error.message}. Manual Convex state is unverified; explicit current-SHA bootstrap required`
    )
    return "bootstrap"
  }
}

/** Token never reaches source builds; requests cannot redirect credentials off Vercel. */
export function vercelClient(token, team, fetcher = fetch) {
  assert.ok(token, "VERCEL_TOKEN missing")
  assert.match(team, /^team_[a-zA-Z0-9]+$/)
  return async (path, method = "GET", body) => {
    assert.match(path, /^\/v[0-9]+\//)
    const url = new URL(`https://api.vercel.com${path}`)
    url.searchParams.set("teamId", team)
    const response = await fetcher(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    })
    assert.ok(
      response.ok,
      `Vercel ${method} ${url.pathname}: ${response.status}`
    )
    return response.status === 204 ||
      (method !== "GET" && path.includes("/promote/"))
      ? null
      : response.json()
  }
}

/** Check project identity and staging controls before touching backend or aliases. */
export function verifyProject(project, id, root) {
  assert.match(id, /^prj_[a-zA-Z0-9]+$/)
  assert.equal(project.id, id)
  assert.equal(project.link?.type, "github")
  assert.equal(project.link?.org?.toLowerCase(), "jcodog")
  assert.equal(project.link?.repo, "Cleo")
  assert.equal(project.link?.productionBranch, "main")
  if (root)
    assert.equal(project.rootDirectory, root, "Wrong Vercel application root")
  assert.equal(
    project.autoAssignCustomDomains,
    false,
    "Vercel automatic domain assignment must be disabled"
  )
}

/** Inspect the immutable provider artifact, never infer a deployed SHA from a build result. */
export function verifyWebDeployment(deployment, project, sha) {
  assert.match(deployment.id, /^dpl_[a-zA-Z0-9]+$/)
  assert.equal(deployment.projectId, project)
  assert.equal(
    deployment.target,
    "production",
    "Preview builds cannot be promoted"
  )
  assert.equal(deployment.meta?.githubCommitSha, sha)
  assert.equal(deployment.readyState, "READY")
  assert.equal(deployment.aliasError ?? null, null)
  assert.ok(
    !deployment.checksState || deployment.checksState === "completed",
    "Deployment checks still pending"
  )
  assert.ok(
    deployment.checksState
      ? deployment.checksConclusion === "succeeded"
      : !deployment.checksConclusion ||
          deployment.checksConclusion === "succeeded",
    "Deployment checks did not succeed"
  )
}

/** Bounded provider polling; tests inject immediate timers and deterministic responses. */
export async function poll(
  read,
  ready,
  pause = () => new Promise((resolve) => setTimeout(resolve, 5000)),
  attempts = 120
) {
  for (let index = 0; index < attempts; index++) {
    const value = await read()
    assert.ok(
      !["ERROR", "CANCELED", "BLOCKED"].includes(value.readyState),
      "Vercel deployment failed"
    )
    assert.equal(
      value.aliasError ?? null,
      null,
      "Vercel alias assignment failed"
    )
    assert.ok(
      !["failed", "canceled", "skipped"].includes(value.checksConclusion),
      "Vercel deployment checks failed"
    )
    if (ready(value)) return value
    if (index + 1 < attempts) await pause()
  }
  throw new Error(
    "Vercel verification timed out; release outcome needs reconciliation"
  )
}

/** Stage Git source at the authenticated SHA. Git integration's main deploys stay disabled. */
export async function stageWeb(api, projectId, sha, recheck, pause, root) {
  const project = await api(`/v9/projects/${projectId}`)
  verifyProject(project, projectId, root)
  const current = project.targets?.production
  if (current?.meta?.githubCommitSha === sha) {
    const deployment = await api(`/v13/deployments/${current.id}`)
    verifyWebDeployment(deployment, projectId, sha)
    return {
      id: deployment.id,
      sha,
      project: projectId,
      state: "already-current",
      root,
    }
  }
  // Never rebuild a successful staged artifact on recovery.
  const list = await api(
    `/v6/deployments?projectId=${projectId}&sha=${sha}&target=production&limit=100`
  )
  assert.ok(
    Array.isArray(list.deployments),
    "Invalid Vercel deployment history"
  )
  assert.ok(
    !list.pagination?.next,
    "Deployment history exceeds recovery window; reconcile before retrying"
  )
  assert.ok(
    !list.deployments?.some(
      (item) =>
        item.meta?.githubCommitSha === sha && item.readySubstate === "PROMOTED"
    ),
    "This revision previously served production and was replaced; explicit recovery or newer main required"
  )
  let deployment = list.deployments?.find(
    (item) =>
      item.meta?.githubCommitSha === sha &&
      item.readyState === "READY" &&
      item.readySubstate === "STAGED"
  )
  if (deployment)
    deployment = await api(
      `/v13/deployments/${deployment.id || deployment.uid}`
    )
  if (!deployment) {
    await recheck()
    deployment = await api("/v13/deployments", "POST", {
      name: project.name,
      project: projectId,
      target: "production",
      gitSource: { type: "github", org: "jcodog", repo: "Cleo", ref: sha, sha },
    })
  }
  assert.match(deployment.id, /^dpl_[a-zA-Z0-9]+$/)
  deployment = await poll(
    () => api(`/v13/deployments/${deployment.id}`),
    (value) =>
      value.readyState === "READY" &&
      (!value.checksState || value.checksState === "completed"),
    pause
  )
  verifyWebDeployment(deployment, projectId, sha)
  assert.equal(
    deployment.readySubstate,
    "STAGED",
    "Web deployment went live outside coordinator"
  )
  assert.notEqual(
    (await api(`/v9/projects/${projectId}`)).targets?.production?.id,
    deployment.id
  )
  return { id: deployment.id, sha, project: projectId, state: "staged", root }
}

/** Request promotion, then confirm both the current target and completed alias assignment. */
export async function promoteWeb(api, staged, recheck, pause) {
  let project = await api(`/v9/projects/${staged.project}`)
  verifyProject(project, staged.project, staged.root)
  let deployment = await api(`/v13/deployments/${staged.id}`)
  verifyWebDeployment(deployment, staged.project, staged.sha)
  if (project.targets?.production?.id === staged.id && deployment.aliasAssigned)
    return "already-current"
  assert.equal(
    deployment.readySubstate,
    "STAGED",
    "Previously promoted deployments require explicit rollback"
  )
  await recheck()
  try {
    await api(
      `/v10/projects/${staged.project}/promote/${staged.id}`,
      "POST",
      {}
    )
  } finally {
    // Vercel promotion can reset this setting. Main Git builds are also disabled in vercel.json.
    await api(`/v9/projects/${staged.project}`, "PATCH", {
      autoAssignCustomDomains: false,
    })
  }
  deployment = await poll(
    () => api(`/v13/deployments/${staged.id}`),
    (value) => Boolean(value.aliasAssigned),
    pause
  )
  verifyWebDeployment(deployment, staged.project, staged.sha)
  project = await api(`/v9/projects/${staged.project}`)
  verifyProject(project, staged.project, staged.root)
  assert.equal(
    project.targets?.production?.id,
    staged.id,
    "Requested deployment is not current"
  )
  return "deployed"
}

/** Every required stage must have explicit evidence; holds and partial releases are non-success. */
export function releaseResult(needs, operation) {
  const states = {}
  if (needs.rollout?.outputs?.enabled !== "true")
    return { state: "held", states }
  if (operation === "validate")
    return {
      state: Object.values(needs).some((job) =>
        ["failure", "cancelled"].includes(job.result)
      )
        ? "failed"
        : "validated",
      states,
    }
  if (operation === "rollback")
    return {
      state: ["discord-rollback", "twitch-rollback"].some(
        (id) => needs[id]?.result === "success"
      )
        ? "recovered"
        : "failed",
      states,
    }
  for (const component of [
    "backend",
    "discord",
    "twitch",
    "dashboard",
    "landing",
  ]) {
    const job =
      needs[
        component === "backend"
          ? "backend"
          : ["discord", "twitch"].includes(component)
            ? `${component}-activate`
            : "web-promote"
      ]
    const current = needs[`${component}-current`]
    states[component] =
      ["dashboard", "landing"].includes(component) &&
      ["deployed", "already-current"].includes(job?.outputs?.[component])
        ? job.outputs[component]
        : job?.result === "success"
          ? job.outputs?.[component] || "failed"
          : current?.result === "success"
            ? "already-current"
            : job?.result === "failure" || current?.result === "failure"
              ? "failed"
              : "skipped"
  }
  const complete = Object.values(states).every((state) =>
    ["deployed", "already-current"].includes(state)
  )
  return {
    state: complete
      ? "deployed"
      : Object.values(states).some((state) => state === "deployed")
        ? "partial"
        : "failed",
    states,
  }
}

/**
 * Execute a policy command on the hosted runner or the VPS's pinned Node runtime.
 * Validates invocation before API access, removes the captured token from child
 * environments and preserves source/receipt ownership across command boundaries.
 * @returns {Promise<void>} Writes only declared Actions outputs and non-secret summaries.
 * @throws {Error} Propagated to the entrypoint handler for a nonzero exit; failure never prints confirmed success.
 */
async function main() {
  const env = process.env
  const command = process.argv[2]
  if (command === "report") {
    const result = releaseResult(
      JSON.parse(env.RELEASE_NEEDS),
      env.INPUT_OPERATION || "deploy"
    )
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## Production release: ${result.state}\n\n${Object.entries(result.states)
        .map(([component, state]) => `- ${component}: ${state}`)
        .join(
          "\n"
        )}\n\nHeld, failed, skipped or partial releases have not completed deployment. Consult component receipts before recovery.\n`
    )
    assert.ok(
      ["deployed", "validated", "recovered"].includes(result.state),
      `Production release ${result.state}`
    )
    return
  }
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
  const selected = invocation(env, event)
  const api = apiClient(env.GH_TOKEN)
  // API client captures its token; Git/classifier subprocesses receive no deploy credentials.
  const vercelToken = env.VERCEL_TOKEN
  for (const key of [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "CONVEX_DEPLOY_KEY",
    "VERCEL_TOKEN",
  ])
    delete env[key]
  const automatic = env.GITHUB_EVENT_NAME === "workflow_run"
  /** Publish known identity/plan scalars as Actions outputs; credentials must never be passed here. */
  const output = (key, value) =>
    appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`)
  /** Record non-secret evidence only after the corresponding API or verification operation succeeds. */
  const summary = (text) => appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`)
  const identity =
    command === "plan"
      ? selected
      : {
          sha: env.RELEASE_SHA,
          runId:
            selected.operation === "rollback" ? 0 : Number(env.SOURCE_RUN_ID),
          attempt:
            selected.operation === "rollback" ? 0 : Number(env.SOURCE_ATTEMPT),
        }
  if (
    [
      "claim",
      "recheck",
      "complete",
      "release",
      "backend-preflight",
      "backend-health",
      "stamp-backend",
      "web-stage",
      "web-promote",
    ].includes(command) &&
    selected.operation === "deploy"
  ) {
    assert.equal(selected.sha, identity.sha)
    assert.equal(Number(selected.runId), identity.runId)
    assert.equal(selected.attempt, identity.attempt)
  }
  if (command === "complete" && selected.operation === "rollback")
    assert.equal(env.COMPONENT, env.INPUT_SERVICE)
  if (command === "plan") {
    let trusted = selected
    if (selected.operation === "deploy")
      trusted = await authenticate(api, selected, automatic)
    else {
      assert.equal(selected.operation, "validate")
      assert.equal((await api("branches/main")).commit?.sha, selected.sha)
    }
    assert.equal(
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      trusted.sha,
      "Workflow policy checkout differs from release SHA; start a new coordinator on current main"
    )
    output("sha", trusted.sha)
    output("source_run", trusted.runId ?? "")
    output("source_attempt", trusted.attempt ?? "")
    summary(
      `### Authorised production plan\n\nOperation: ${selected.operation}\n\nSHA: \`${trusted.sha}\`\n\nRegression run: ${trusted.runId ?? "validation only"}, attempt: ${trusted.attempt ?? "none"}`
    )
    for (const component of ["backend", "discord", "twitch"]) {
      const base =
        selected.operation === "deploy" ? await baseline(api, component) : ""
      const mode = { backend: "backend", discord: "deploy", twitch: "twitch" }[
        component
      ]
      const classified = execFileSync(
        process.execPath,
        [
          "apps/discord-bot/src/deployment/classifyChanges.ts",
          mode,
          base,
          trusted.sha,
        ],
        { encoding: "utf8" }
      ).trim()
      assert.ok(
        ["true", "false"].includes(classified),
        "Invalid classifier result"
      )
      const service = env.INPUT_SERVICE || "both"
      const required =
        selected.operation === "validate"
          ? component !== "backend" && ["both", component].includes(service)
          : classified === "true"
      output(component, required)
      output(`${component}_base`, base)
      summary(
        `\n${component}: ${required ? "required" : "skipped"}; comparison baseline: ${base || "unknown, conservative"}`
      )
    }
  } else if (command === "backend-preflight") {
    assert.equal(selected.operation, "deploy")
    const state = await backendPreflight({
      url: env.CONVEX_PRODUCTION_URL,
      base: env.BACKEND_BASE_SHA,
      bootstrap: env.BACKEND_BOOTSTRAP_SHA,
      sha: identity.sha,
      event: env.GITHUB_EVENT_NAME,
    })
    if (state === "bootstrap") {
      summary(
        "Operator-authorised backend bootstrap. Prior manual deployment SHA remains unknown; no receipt was fabricated."
      )
    }
  } else if (command === "backend-health") {
    await backendHealth(env.CONVEX_PRODUCTION_URL, env.EXPECTED_BACKEND_SHA)
    output(
      "backend",
      env.BACKEND_APPLIED === "true" ? "deployed" : "already-current"
    )
    summary(
      `Convex health and database query verified at ${env.EXPECTED_BACKEND_SHA}`
    )
  } else if (command === "stamp-backend") {
    assert.match(identity.sha, shaPattern)
    writeFileSync(
      "packages/backend/convex/releaseVersion.ts",
      `export const releaseSha: string | null = ${JSON.stringify(identity.sha)}\n`
    )
  } else if (["web-stage", "web-promote"].includes(command)) {
    assert.equal(selected.operation, "deploy")
    const vercel = vercelClient(vercelToken, env.VERCEL_TEAM_ID)
    const recheck = () => authenticate(api, identity, automatic)
    assert.notEqual(
      env.VERCEL_DASHBOARD_PROJECT_ID,
      env.VERCEL_LANDING_PROJECT_ID,
      "Web projects must be distinct"
    )
    await recheck()
    for (const component of ["dashboard", "landing"]) {
      const project = env[`VERCEL_${component.toUpperCase()}_PROJECT_ID`]
      assert.match(project ?? "", /^prj_[a-zA-Z0-9]+$/)
      if (command === "web-stage") {
        const staged = await stageWeb(
          vercel,
          project,
          identity.sha,
          recheck,
          undefined,
          `apps/${component}`
        )
        output(component, JSON.stringify(staged))
        summary(
          `${component}: ${staged.state}, immutable Vercel artifact ${staged.id}, SHA ${staged.sha}`
        )
      } else {
        const staged = JSON.parse(env[`STAGED_${component.toUpperCase()}`])
        assert.equal(staged.project, project)
        assert.equal(staged.sha, identity.sha)
        assert.equal(staged.root, `apps/${component}`)
        for (const service of ["backend", "discord", "twitch"]) {
          const expected = env[`${service.toUpperCase()}_VERIFIED_SHA`]
          assert.equal(
            await baseline(api, service),
            expected,
            `${service} receipt changed before web promotion`
          )
        }
        await backendHealth(env.CONVEX_PRODUCTION_URL, env.BACKEND_VERIFIED_SHA)
        const record = await claim(
          api,
          identity,
          component,
          "deploy",
          env.GITHUB_RUN_ID,
          automatic,
          env.GITHUB_RUN_ATTEMPT,
          { vercelDeployment: staged.id, project: staged.project }
        )
        // Any interruption leaves intent in progress. A later run inspects actual provider state.
        const state = await promoteWeb(vercel, staged, recheck)
        await finishClaim(
          api,
          identity,
          record.id,
          {
            component,
            operation: "deploy",
            coordinatorRun: env.GITHUB_RUN_ID,
            coordinatorAttempt: env.GITHUB_RUN_ATTEMPT,
          },
          "success"
        )
        output(component, state)
        summary(
          `${component}: ${state}; Vercel current ${staged.id}; GitHub receipt ${record.id}`
        )
      }
    }
  } else if (command === "recheck") {
    assert.equal(selected.operation, "deploy")
    assert.equal(selected.sha, identity.sha)
    assert.equal(Number(selected.runId), identity.runId)
    if (selected.attempt) assert.equal(selected.attempt, identity.attempt)
    await authenticate(api, identity, automatic)
  } else if (command === "claim") {
    if (selected.operation === "deploy") {
      assert.equal(selected.sha, identity.sha)
      assert.equal(Number(selected.runId), identity.runId)
    } else {
      assert.equal(selected.operation, "rollback")
      identity.sha = (await api("branches/main")).commit?.sha
      assert.match(identity.sha, shaPattern)
      assert.equal(env.COMPONENT, env.INPUT_SERVICE)
    }
    const record = await claim(
      api,
      identity,
      env.COMPONENT,
      selected.operation,
      env.GITHUB_RUN_ID,
      automatic,
      env.GITHUB_RUN_ATTEMPT
    )
    output("receipt", record.id)
    output("apply", record.apply)
    output("sha", identity.sha)
  } else if (command === "complete") {
    assert.ok(["deploy", "rollback"].includes(selected.operation))
    await finishClaim(
      api,
      identity,
      env.RECEIPT_ID,
      {
        component: env.COMPONENT,
        operation: selected.operation,
        coordinatorRun: env.GITHUB_RUN_ID,
        coordinatorAttempt: env.GITHUB_RUN_ATTEMPT,
      },
      env.RECEIPT_STATE || "success"
    )
    summary(
      `\nConfirmed ${env.COMPONENT} ${selected.operation} ${env.RECEIPT_STATE || "success"} for intent \`${identity.sha}\`, receipt ${env.RECEIPT_ID}.`
    )
    output(
      env.COMPONENT,
      (env.RECEIPT_STATE || "success") === "success" ? "deployed" : "failed"
    )
  } else if (command === "release") {
    assert.equal(selected.operation, "deploy")
    await releaseClaim(
      api,
      identity,
      env.RECEIPT_ID,
      env.GITHUB_RUN_ID,
      env.COMPONENT,
      env.GITHUB_RUN_ATTEMPT
    )
  } else if (command === "packages") {
    packagesReady(
      {
        discord: env.DISCORD_REQUIRED === "true",
        twitch: env.TWITCH_REQUIRED === "true",
      },
      { discord: env.DISCORD_RESULT, twitch: env.TWITCH_RESULT }
    )
  } else throw new Error("Unknown production policy command")
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

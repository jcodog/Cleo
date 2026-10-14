import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
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
}
const shaPattern = /^[a-f0-9]{40}$(?![\s\S])/

/** Authenticate GitHub API evidence, including the jobs from this exact attempt. */
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

/** Restrict all callers before reading credentials or making API requests. */
export function invocation(env, event) {
  assert.equal(env.GITHUB_REPOSITORY, repository)
  assert.equal(env.GITHUB_REF, "refs/heads/main")
  const operation = env.INPUT_OPERATION || "deploy"
  assert.ok(["validate", "deploy", "rollback"].includes(operation))
  assert.ok(["both", "discord", "twitch"].includes(env.INPUT_SERVICE || "both"))
  if (env.GITHUB_EVENT_NAME === "workflow_run") {
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
  return { operation, sha: env.INPUT_SHA, runId: Number(env.INPUT_RUN_ID) }
}

/** Read/write only this repository. Pagination never silently truncates evidence. */
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
  const branch = await api("branches/main")
  return verifyEvidence({
    ...identity,
    run,
    workflow,
    jobs,
    mainSha: branch.commit?.sha,
  })
}

/** Custom deployment tasks distinguish durable release receipts from environment jobs. */
export async function receipts(api, component) {
  assert.ok(Object.hasOwn(environments, component))
  const records = []
  for (let page = 1; ; page++) {
    const batch = await api(
      `deployments?task=cleo-${component}&environment=${environments[component]}&per_page=100&page=${page}`
    )
    assert.ok(Array.isArray(batch))
    records.push(...batch)
    if (batch.length < 100) break
  }
  return records.sort((a, b) => b.id - a.id)
}

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

export async function baseline(api, component) {
  const [latest] = await receipts(api, component)
  if (!latest) return ""
  return latest.payload.operation === "deploy" &&
    (await receiptState(api, latest)) === "success"
    ? latest.sha
    : ""
}

/** A backend receipt is claimed BEFORE deploy. Unknown outcomes require operator reconciliation. */
export async function claim(
  api,
  identity,
  component,
  operation,
  coordinatorRun,
  automatic = false
) {
  assert.ok(Object.hasOwn(environments, component))
  if (operation === "deploy") await authenticate(api, identity, automatic)
  else assert.equal(operation, "rollback")
  if (component === "backend") {
    assert.equal(operation, "deploy")
    for (const record of await receipts(api, component)) {
      if (record.sha !== identity.sha) continue
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
      sourceRun: identity.runId,
      sourceAttempt: identity.attempt,
      coordinatorRun,
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

/** Allow skipped package jobs only when the verified plan did not require them. */
export function packagesReady(plan, results) {
  for (const component of ["discord", "twitch"]) {
    assert.equal(
      results[component],
      plan[component] ? "success" : "skipped",
      `${component} packaging did not match the authorised plan`
    )
  }
}

/** Command-line entrypoint also runs on the VPS using its installed pinned Node. */
async function main() {
  const env = process.env
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
  const selected = invocation(env, event)
  const api = apiClient(env.GH_TOKEN)
  const automatic = env.GITHUB_EVENT_NAME === "workflow_run"
  const command = process.argv[2]
  const output = (key, value) =>
    appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`)
  const summary = (text) => appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`)
  const identity =
    command === "plan"
      ? selected
      : {
          sha: env.RELEASE_SHA,
          runId: Number(env.SOURCE_RUN_ID),
          attempt: Number(env.SOURCE_ATTEMPT),
        }
  if (command === "plan") {
    let trusted = selected
    if (selected.operation === "deploy")
      trusted = await authenticate(api, selected, automatic)
    else {
      assert.equal(selected.operation, "validate")
      assert.equal((await api("branches/main")).commit?.sha, selected.sha)
    }
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
      summary(
        `\n${component}: ${required ? "required" : "skipped"}; comparison baseline: ${base || "unknown, conservative"}`
      )
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
      automatic
    )
    output("receipt", record.id)
    output("apply", record.apply)
  } else if (command === "complete") {
    assert.equal(selected.operation, "deploy")
    assert.match(env.RECEIPT_ID ?? "", /^[1-9][0-9]*$/)
    await api(`deployments/${env.RECEIPT_ID}/statuses`, "POST", {
      state: "success",
      auto_inactive: false,
    })
    summary(
      `\nConfirmed ${env.COMPONENT} success for \`${identity.sha}\`, receipt ${env.RECEIPT_ID}.`
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

import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  previewConfig,
  previewUrl,
  verifyClerkInstance,
  verifyPreviewEnvironment,
  verifyAndBuildPreview,
} from "./build-dashboard-preview.mjs"

const env = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_REPO_OWNER: "jcodog",
  VERCEL_GIT_REPO_SLUG: "Cleo",
  VERCEL_GIT_COMMIT_REF: "perf/convex-community-role-io",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  CONVEX_DEPLOY_KEY: "preview:test-team:test-project|fixture",
  CLEO_PREVIEW_ORIGIN: "https://review.example.com",
  NEXT_PUBLIC_APP_URL: "https://review.example.com",
  CLEO_PREVIEW_CLERK_ISSUER: "https://clerk.example.com",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`,
  CLERK_SECRET_KEY: "sk_test_fixture",
}

test("unconfigured Git previews are skipped before entering the privileged build", () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../apps/dashboard/vercel.json", import.meta.url),
      "utf8"
    )
  )
  assert.equal(
    config.ignoreCommand,
    "node ../../scripts/ignore-dashboard-preview.mjs"
  )
  const script = fileURLToPath(
    new URL("./ignore-dashboard-preview.mjs", import.meta.url)
  )
  const run = (overrides) =>
    spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_GIT_REPO_OWNER: "jcodog",
        VERCEL_GIT_REPO_SLUG: "Cleo",
        VERCEL_GIT_COMMIT_REF: "perf/convex-community-role-io",
        CONVEX_DEPLOY_KEY: "",
        ...overrides,
      },
      encoding: "utf8",
    })
  const absent = run({})
  assert.equal(absent.status, 0, absent.stderr)
  assert.match(absent.stdout, /not configured/)
  const configured = run({ CONVEX_DEPLOY_KEY: env.CONVEX_DEPLOY_KEY })
  assert.equal(configured.status, 1, configured.stderr)
  assert.ok(!configured.stdout.includes(env.CONVEX_DEPLOY_KEY))
  assert.equal(
    run({
      CONVEX_DEPLOY_KEY: env.CONVEX_DEPLOY_KEY,
      VERCEL_GIT_COMMIT_REF: "feat/cleo-dashboard-account-billing",
    }).status,
    0
  )
  assert.equal(run({ VERCEL_ENV: "production" }).status, 1)
  assert.equal(run({ VERCEL_ENV: "" }).status, 0)
  const forced = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./build-dashboard-preview.mjs", import.meta.url))],
    {
      env: { ...process.env, ...env, CONVEX_DEPLOY_KEY: "" },
      encoding: "utf8",
    }
  )
  assert.equal(forced.status, 1)
  assert.match(forced.stderr, /Preview Deploy Key is required/)
})
test("only the trusted preview source, Preview project key and matching development identities can deploy", () => {
  assert.equal(previewConfig(env).sha, env.VERCEL_GIT_COMMIT_SHA)
  for (const change of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_REPO_OWNER: "fork" },
    { VERCEL_GIT_COMMIT_REF: "untrusted" },
    { VERCEL_GIT_COMMIT_SHA: "short" },
    { CONVEX_DEPLOY_KEY: "" },
    { CONVEX_DEPLOY_KEY: "prod:deployment|fixture" },
    { CONVEX_DEPLOY_KEY: "preview:deployment|fixture" },
    { CONVEX_DEPLOY_KEY: "preview:team:project:extra|fixture" },
    { CLEO_PREVIEW_ORIGIN: "https://review.example.com/path" },
    { CLEO_PREVIEW_ORIGIN: "https://*.vercel.app" },
    { CLERK_SECRET_KEY: "sk_live_fixture" },
    { NEXT_PUBLIC_APP_URL: "https://wrong.example.com" },
    { CLEO_PREVIEW_CLERK_ISSUER: "https://other.example.com" },
    { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_fixture" },
  ])
    assert.throws(() => previewConfig({ ...env, ...change }))
  assert.throws(
    () => previewConfig({ ...env, CLEO_PREVIEW_ORIGIN: undefined }),
    /CLEO_PREVIEW_ORIGIN/
  )
  assert.throws(
    () => previewConfig({ ...env, CLEO_PREVIEW_CLERK_ISSUER: undefined }),
    /CLEO_PREVIEW_CLERK_ISSUER/
  )
})
test("claimed preview URLs reject shared development, aliases and credentials", () => {
  assert.equal(
    previewUrl("https://isolated-review-123.convex.cloud"),
    "https://isolated-review-123.convex.cloud"
  )
  for (const url of [
    "https://compassionate-goose-199.convex.cloud",
    "https://evil.example.com",
    "http://preview.convex.cloud",
    "https://preview.convex.cloud/path",
    "https://user@preview.convex.cloud",
  ])
    assert.throws(() => previewUrl(url))
})

test("Clerk secret must belong to the configured development issuer", async () => {
  const config = previewConfig(env)
  await verifyClerkInstance(env, config, async (_url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${env.CLERK_SECRET_KEY}`)
    return Response.json({ data: [{ frontend_api_url: "clerk.example.com" }] })
  })
  for (const result of [
    { data: [{ frontend_api_url: "other.example.com" }] },
    {},
    { data: [] },
  ])
    await assert.rejects(
      verifyClerkInstance(env, config, async () => Response.json(result)),
      /does not match/
    )
})

test("frontend cannot pass a missing, unsafe or changed backend receipt", async () => {
  const config = previewConfig(env)
  const url = "https://review.convex.cloud"
  const value = { ...config, url, isolated: true, schemaReady: true }
  const events = []
  const operations = {
    receipt: async () => {
      events.push("receipt")
      return value
    },
    providers: async () => {
      events.push("providers")
      return true
    },
    buildFrontend: async () => {
      events.push("build")
    },
  }
  await verifyAndBuildPreview(config, url, operations)
  assert.deepEqual(events, [
    "receipt",
    "providers",
    "build",
    "receipt",
    "providers",
  ])
  for (const bad of [
    null,
    { ...value, sha: "b".repeat(40) },
    { ...value, isolated: false },
    { ...value, schemaReady: false },
    { ...value, url: "https://other.convex.cloud" },
  ]) {
    events.length = 0
    await assert.rejects(
      verifyAndBuildPreview(config, url, {
        ...operations,
        receipt: async () => bad,
      }),
      /parity/
    )
    assert.ok(!events.includes("build"))
  }
  events.length = 0
  await assert.rejects(
    verifyAndBuildPreview(config, url, {
      ...operations,
      providers: async () => false,
    }),
    /parity/
  )
  assert.ok(!events.includes("build"))
  let reads = 0
  await assert.rejects(
    verifyAndBuildPreview(config, url, {
      ...operations,
      receipt: async () =>
        ++reads === 1 ? value : { ...value, sha: "b".repeat(40) },
    }),
    /parity/
  )
  assert.equal(reads, 2)
})

test("Preview inventory accepts only explicitly approved deployment variables", () => {
  const inventory = "CLERK_SECRET_KEY\nSTRIPE_TEST_CHECKOUT_ENABLED"
  assert.doesNotThrow(() => verifyPreviewEnvironment(inventory))
  for (const unexpected of ["SENTRY_AUTH_TOKEN", "PROVIDER_CREDENTIAL"]) {
    assert.throws(
      () => verifyPreviewEnvironment(inventory + "\n" + unexpected),
      /unexpected environment variables/
    )
  }
})

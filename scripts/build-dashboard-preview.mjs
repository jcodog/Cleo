import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const backend = join(root, "packages/backend")
const stampPath = join(backend, "convex/previewVersion.ts")

class PreviewConfigurationError extends Error {}

function configuredOrigin(env, name) {
  try {
    const url = new URL(env[name])
    if (
      url.protocol === "https:" &&
      url.origin === env[name] &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hostname.includes("*")
    )
      return url
  } catch {
    /* Report the variable name, never its value. */
  }
  throw new PreviewConfigurationError(
    `${name} must be one exact controlled HTTPS origin.`
  )
}

export function previewConfig(env) {
  if (env.VERCEL_ENV !== "preview")
    throw new PreviewConfigurationError("Preview environment required.")
  if (
    env.VERCEL_GIT_REPO_OWNER !== "jcodog" ||
    env.VERCEL_GIT_REPO_SLUG !== "Cleo" ||
    env.VERCEL_GIT_COMMIT_REF !== "feat/cleo-dashboard-account-billing"
  )
    throw new PreviewConfigurationError(
      "Only the approved PR #284 branch may deploy an isolated Preview backend."
    )
  if (!/^preview:[^:|\s]+:[^:|\s]+\|[^\s]+$/.test(env.CONVEX_DEPLOY_KEY ?? ""))
    throw new PreviewConfigurationError(
      "A restricted Convex project Preview Deploy Key is required. See docs/isolated-review-preview.md."
    )
  if (!/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? ""))
    throw new PreviewConfigurationError("Exact source SHA required.")
  const origin = configuredOrigin(env, "CLEO_PREVIEW_ORIGIN")
  const issuer = configuredOrigin(env, "CLEO_PREVIEW_CLERK_ISSUER")
  const key = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
  if (
    !key.startsWith("pk_test_") ||
    Buffer.from(key.slice(8), "base64").toString().replace(/\$$/, "") !==
      issuer.hostname ||
    !env.CLERK_SECRET_KEY?.startsWith("sk_test_")
  )
    throw new PreviewConfigurationError(
      "Preview frontend must use the matching development Clerk instance."
    )
  if (
    env.NEXT_PUBLIC_APP_URL !== origin.origin ||
    (env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      !env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_"))
  )
    throw new PreviewConfigurationError(
      "Preview frontend origin or Stripe test mode mismatch."
    )
  return {
    sha: env.VERCEL_GIT_COMMIT_SHA,
    branch: env.VERCEL_GIT_COMMIT_REF,
    origin: origin.origin,
    issuer: issuer.origin,
  }
}

export function previewUrl(value) {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.convex\.cloud$/.test(url.hostname) ||
    url.origin !== value ||
    url.hostname === "compassionate-goose-199.convex.cloud"
  )
    throw new Error(
      "The claimed backend must be an isolated hosted Preview deployment."
    )
  return url.origin
}

export async function verifyClerkInstance(env, config, request = fetch) {
  const response = await request("https://api.clerk.com/v1/domains", {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    signal: AbortSignal.timeout(15000),
  })
  const result = await response.json()
  if (
    !response.ok ||
    !Array.isArray(result.data) ||
    !result.data.some((domain) =>
      [config.issuer, new URL(config.issuer).hostname].includes(
        domain.frontend_api_url
      )
    )
  )
    throw new Error(
      "Preview Clerk secret does not match the configured issuer."
    )
}

export function verifyPreviewEnvironment(inventory) {
  const allowed = new Set([
    "CLERK_JWT_ISSUER_DOMAIN",
    "CLERK_SECRET_KEY",
    "CLEO_DASHBOARD_ORIGIN",
    "CLEO_DASHBOARD_ALLOWED_ORIGINS",
    "CLEO_COMMUNITY_ROLES_ENABLED",
    "CLEO_RECOGNITION_ENABLED",
    "STRIPE_SECRET_KEY",
    "STRIPE_EXPECTED_ACCOUNT_ID",
    "STRIPE_TEST_CHECKOUT_ENABLED",
    "STRIPE_CATALOGUE_WRITES_ENABLED",
  ])
  if (
    inventory
      .split(/\r?\n/)
      .filter(Boolean)
      .some((name) => !allowed.has(name))
  )
    throw new Error("Preview backend has unexpected environment variables.")
}

function previewCommand(args, env, branch, envFile) {
  // Convex 1.48 hides this selector on env/run. Keep it explicit so the
  // Preview key cannot fall through to a default deployment.
  const result = spawnSync(
    process.execPath,
    [
      "x",
      "--no-install",
      "convex",
      ...args,
      "--preview-name",
      branch,
      "--env-file",
      envFile,
    ],
    { cwd: backend, env, encoding: "utf8", timeout: 30000 }
  )
  if (result.status !== 0)
    throw new Error("Could not inspect the selected Convex Preview.")
  return result.stdout.trim()
}

/** Gate both sides of the frontend build on the exact deployed backend. */
export async function verifyAndBuildPreview(config, url, operations) {
  const verify = async () => {
    const value = await operations.receipt()
    if (
      value?.sha !== config.sha ||
      value.branch !== config.branch ||
      value.url !== url ||
      !value.isolated ||
      !value.schemaReady ||
      !(await operations.providers())
    )
      throw new Error("Preview backend parity or isolation failed.")
    return value
  }
  await verify()
  await operations.buildFrontend()
  return verify()
}

function run(args, env, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
  })
  if (result.status !== 0)
    throw new Error(
      "Preview command failed. No frontend acceptance is claimed."
    )
}

export function preparePreviewEnvironments(env, directory) {
  const childEnv = { ...env, CLEO_PREVIEW_URL_FILE: join(directory, "url") }
  delete childEnv.CONVEX_DEPLOYMENT
  delete childEnv.CONVEX_SELF_HOSTED_URL
  delete childEnv.CONVEX_SELF_HOSTED_ADMIN_KEY
  delete childEnv.CONVEX_DEPLOYMENT_TOKEN
  delete childEnv.CONVEX_OVERRIDE_ACCESS_TOKEN
  delete childEnv.CONVEX_PROVISION_HOST
  const envFile = join(directory, "preview.env")
  childEnv.CLEO_PREVIEW_ENV_FILE = envFile
  // With --env-file, the CLI reads deployment selection from the file only.
  writeFileSync(
    envFile,
    `CONVEX_DEPLOY_KEY=${JSON.stringify(env.CONVEX_DEPLOY_KEY)}\n`,
    { mode: 0o600 }
  )
  return {
    childEnv,
    envFile,
    frontendEnv: (url) => {
      const frontend = { ...childEnv, NEXT_PUBLIC_CONVEX_URL: url }
      delete frontend.CONVEX_DEPLOY_KEY
      delete frontend.CLEO_PREVIEW_ENV_FILE
      return frontend
    },
  }
}

async function main() {
  const env = process.env
  if (env.VERCEL_ENV === "production") {
    // Preserve the existing manually gated production build behavior.
    run(["run", "--filter", "@workspace/dashboard", "build"], env)
    return
  }
  if (env.VERCEL_ENV !== "preview")
    throw new PreviewConfigurationError(
      "VERCEL_ENV must identify Preview or the manually gated Production build."
    )
  const config = previewConfig(env)
  if (process.argv.includes("--capture")) {
    const url = previewUrl(env.NEXT_PUBLIC_CONVEX_URL)
    verifyPreviewEnvironment(
      previewCommand(
        ["env", "list", "--names-only"],
        env,
        config.branch,
        env.CLEO_PREVIEW_ENV_FILE
      )
    )
    writeFileSync(
      stampPath,
      `export const previewBuild = ${JSON.stringify({ ...config, url })}\n`
    )
    writeFileSync(env.CLEO_PREVIEW_URL_FILE, url, { mode: 0o600 })
    return
  }
  const source = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  })
  const dirty = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" }
  )
  if (
    source.status !== 0 ||
    source.stdout.trim() !== config.sha ||
    dirty.status !== 0 ||
    dirty.stdout.trim()
  )
    throw new Error(
      "Preview deployment requires a clean checkout of the exact source SHA."
    )
  await verifyClerkInstance(env, config)
  const directory = mkdtempSync(join(tmpdir(), "cleo-review-"))
  const original = readFileSync(stampPath)
  try {
    const { childEnv, envFile, frontendEnv } = preparePreviewEnvironments(
      env,
      directory
    )
    // Convex runs --cmd BEFORE its push. Capture only, then await the full push.
    run(
      [
        "x",
        "--no-install",
        "convex",
        "deploy",
        "--preview-name",
        config.branch,
        "--env-file",
        envFile,
        "--cmd",
        "bun ../../scripts/build-dashboard-preview.mjs --capture",
        "--cmd-url-env-var-name",
        "NEXT_PUBLIC_CONVEX_URL",
      ],
      childEnv,
      backend
    )
    const url = previewUrl(readFileSync(childEnv.CLEO_PREVIEW_URL_FILE, "utf8"))
    const read = async (kind, path) => {
      const response = await fetch(`${url}/api/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          args: {},
          format: "json",
        }),
        signal: AbortSignal.timeout(15000),
      })
      const receipt = await response.json()
      if (!response.ok || receipt.status !== "success")
        throw new Error("Preview receipt failed.")
      return receipt.value
    }
    const value = await verifyAndBuildPreview(config, url, {
      receipt: () => read("query", "previewHealth:read"),
      providers: () => {
        verifyPreviewEnvironment(
          previewCommand(
            ["env", "list", "--names-only"],
            childEnv,
            config.branch,
            envFile
          )
        )
        return (
          previewCommand(
            [
              "run",
              "previewHealth:verifyProviders",
              JSON.stringify({ sha: config.sha, url }),
            ],
            childEnv,
            config.branch,
            envFile
          ) === "true"
        )
      },
      buildFrontend: async () =>
        run(
          ["run", "--filter", "@workspace/dashboard", "build"],
          frontendEnv(url)
        ),
    })
    console.log(JSON.stringify({ previewReceipt: value }))
  } finally {
    writeFileSync(stampPath, original)
    rmSync(directory, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main().catch((error) => {
    console.error(
      error instanceof PreviewConfigurationError
        ? error.message
        : "Dashboard preview build failed. Check the Preview key, trusted source, origin and isolation configuration. See docs/isolated-review-preview.md."
    )
    process.exitCode = 1
  })

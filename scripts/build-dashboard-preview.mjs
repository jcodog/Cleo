import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { checkDashboardBackend } from "./check-dashboard-backend.mjs"

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
    env.VERCEL_GIT_COMMIT_REF !== "perf/convex-community-role-io"
  )
    throw new PreviewConfigurationError(
      "Only the approved stacked review branch may deploy a backend."
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
  const directory = mkdtempSync(join(tmpdir(), "cleo-review-"))
  const original = readFileSync(stampPath)
  const childEnv = { ...env, CLEO_PREVIEW_URL_FILE: join(directory, "url") }
  delete childEnv.CONVEX_DEPLOYMENT
  delete childEnv.CONVEX_SELF_HOSTED_URL
  delete childEnv.CONVEX_SELF_HOSTED_ADMIN_KEY
  const envFile = join(directory, "empty.env")
  writeFileSync(envFile, "")
  try {
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
    const response = await fetch(`${url}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "previewHealth:read",
        args: {},
        format: "json",
      }),
      signal: AbortSignal.timeout(15000),
    })
    const receipt = await response.json()
    const value = receipt.value
    if (
      !response.ok ||
      receipt.status !== "success" ||
      value?.sha !== config.sha ||
      value.branch !== config.branch ||
      value.url !== url ||
      !value.isolated ||
      !value.schemaReady
    )
      throw new Error(
        "Preview backend parity or isolation failed. Check the restricted Preview environment."
      )
    await checkDashboardBackend(url)
    console.log(JSON.stringify({ previewReceipt: value }))
    // The frontend build receives no privileged backend deploy credential.
    const frontendEnv = { ...childEnv, NEXT_PUBLIC_CONVEX_URL: url }
    delete frontendEnv.CONVEX_DEPLOY_KEY
    run(["run", "--filter", "@workspace/dashboard", "build"], frontendEnv)
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

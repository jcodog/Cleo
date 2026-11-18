// Vercel's Ignored Build Step uses 0 to skip and 1 to continue.
// This runs before dependency installation and never deploys or builds an app.
const target = process.env.VERCEL_ENV
const configured = !!process.env.CONVEX_DEPLOY_KEY
const ignore =
  !["preview", "production"].includes(target) ||
  (target === "preview" &&
    (!configured ||
      process.env.VERCEL_GIT_REPO_OWNER !== "jcodog" ||
      process.env.VERCEL_GIT_REPO_SLUG !== "Cleo" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "feat/cleo-dashboard-account-billing"))

console.log(
  ignore
    ? "Isolated Preview is not configured. Deployment skipped before build; no shared backend fallback. See docs/isolated-review-preview.md."
    : "Continuing to the validated dashboard build."
)
process.exitCode = ignore ? 0 : 1

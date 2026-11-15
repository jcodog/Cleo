import assert from "node:assert/strict"
import { test } from "node:test"
import { previewConfig, previewUrl } from "./build-dashboard-preview.mjs"

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
    { CLEO_PREVIEW_ORIGIN: "https://review.example.com/path" },
    { CLEO_PREVIEW_ORIGIN: "https://*.vercel.app" },
    { CLERK_SECRET_KEY: "sk_live_fixture" },
    { NEXT_PUBLIC_APP_URL: "https://wrong.example.com" },
    { CLEO_PREVIEW_CLERK_ISSUER: "https://other.example.com" },
    { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_fixture" },
  ])
    assert.throws(() => previewConfig({ ...env, ...change }))
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

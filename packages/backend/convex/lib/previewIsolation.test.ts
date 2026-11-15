import assert from "node:assert/strict"
import { test } from "node:test"
import { isReviewPreviewIsolated } from "./previewIsolation"

test("preview isolation rejects live credentials, side-effect workers, enabled gates and identity/origin aliases", () => {
  const build = {
    sha: "a".repeat(40),
    branch: "review",
    url: "https://review.convex.cloud",
    issuer: "https://development.clerk.accounts.dev",
    origin: "https://review.example.com",
  }
  const env = {
    CONVEX_CLOUD_URL: build.url,
    CLERK_JWT_ISSUER_DOMAIN: build.issuer,
    CLERK_SECRET_KEY: "sk_test_fixture",
    STRIPE_TEST_CHECKOUT_ENABLED: "false",
    STRIPE_CATALOGUE_WRITES_ENABLED: "false",
    CLEO_DASHBOARD_ORIGIN: build.origin,
  }
  assert.equal(isReviewPreviewIsolated(env, build), true)
  assert.equal(
    isReviewPreviewIsolated(
      {
        ...env,
        STRIPE_SECRET_KEY: "sk_test_fixture",
        STRIPE_EXPECTED_ACCOUNT_ID: "acct_1RGgwvE1e1YdqDQQ",
      },
      build
    ),
    true
  )
  for (const unsafe of [
    { CONVEX_CLOUD_URL: "https://compassionate-goose-199.convex.cloud" },
    { CLERK_JWT_ISSUER_DOMAIN: "https://other.clerk.accounts.dev" },
    { CLERK_SECRET_KEY: "sk_live_fixture" },
    { STRIPE_SECRET_KEY: "sk_live_fixture" },
    {
      STRIPE_SECRET_KEY: "sk_test_fixture",
      STRIPE_EXPECTED_ACCOUNT_ID: "acct_other",
    },
    { STRIPE_TEST_CHECKOUT_ENABLED: "true" },
    { STRIPE_TEST_CHECKOUT_ENABLED: undefined },
    { STRIPE_CATALOGUE_WRITES_ENABLED: "true" },
    { CLEO_COMMUNITY_ROLES_ENABLED: "true" },
    { CLEO_RECOGNITION_ENABLED: "true" },
    { DISCORD_BOT_TOKEN: "fixture" },
    { TWITCH_WORKER_SECRET: "fixture" },
    { RESEND_API_KEY: "fixture" },
    { CLERK_WEBHOOK_SECRET: "fixture" },
    { CLEO_DASHBOARD_ORIGIN: "https://other.example.com" },
    { CLEO_DASHBOARD_ALLOWED_ORIGINS: "https://*.vercel.app" },
  ])
    assert.equal(isReviewPreviewIsolated({ ...env, ...unsafe }, build), false)
})

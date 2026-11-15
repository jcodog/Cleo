import type { previewBuild } from "../previewVersion"

export function isReviewPreviewIsolated(
  env: Record<string, string | undefined>,
  build: NonNullable<typeof previewBuild>
): boolean {
  const forbiddenCredential = Object.keys(env).some(
    (name) =>
      /(?:_SECRET|_TOKEN|_KEY)(?:$|_)/.test(name) &&
      !["CLERK_SECRET_KEY", "STRIPE_SECRET_KEY"].includes(name) &&
      !!env[name]
  )
  return (
    !forbiddenCredential &&
    env.CONVEX_CLOUD_URL === build.url &&
    env.CLERK_JWT_ISSUER_DOMAIN === build.issuer &&
    !!env.CLERK_SECRET_KEY?.startsWith("sk_test_") &&
    env.STRIPE_TEST_CHECKOUT_ENABLED === "false" &&
    env.STRIPE_CATALOGUE_WRITES_ENABLED === "false" &&
    env.CLEO_COMMUNITY_ROLES_ENABLED !== "true" &&
    env.CLEO_RECOGNITION_ENABLED !== "true" &&
    (!env.STRIPE_SECRET_KEY ||
      (env.STRIPE_SECRET_KEY.startsWith("sk_test_") &&
        env.STRIPE_EXPECTED_ACCOUNT_ID === "acct_1RGgwvE1e1YdqDQQ")) &&
    env.CLEO_DASHBOARD_ORIGIN === build.origin &&
    (!env.CLEO_DASHBOARD_ALLOWED_ORIGINS ||
      env.CLEO_DASHBOARD_ALLOWED_ORIGINS === build.origin)
  )
}

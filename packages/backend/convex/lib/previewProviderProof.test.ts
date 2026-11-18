import assert from "node:assert/strict"
import { test } from "node:test"
import { verifyPreviewProviders } from "./previewProviderProof"

test("preview proof checks actual Clerk instance and actual approved Stripe account", async () => {
  const env = {
    CLERK_SECRET_KEY: "sk_test_fixture",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_EXPECTED_ACCOUNT_ID: "acct_1RGgwvE1e1YdqDQQ",
  }
  const issuer = "https://review.clerk.accounts.dev"
  const urls: string[] = []
  const request: typeof fetch = async (input) => {
    urls.push(String(input))
    return Response.json(
      String(input).includes("clerk.com")
        ? { data: [{ frontend_api_url: issuer }] }
        : { id: env.STRIPE_EXPECTED_ACCOUNT_ID }
    )
  }
  assert.equal(await verifyPreviewProviders(env, issuer, request), true)
  assert.deepEqual(urls, [
    "https://api.clerk.com/v1/domains",
    "https://api.stripe.com/v1/account",
  ])
  for (const wrong of [
    async () =>
      Response.json({
        data: [{ frontend_api_url: "other.clerk.accounts.dev" }],
      }),
    async (input: Parameters<typeof fetch>[0]) =>
      String(input).includes("clerk.com")
        ? request(input)
        : Response.json({ id: "acct_other" }),
    async () => Response.json({}, { status: 401 }),
    async () => {
      throw new Error("unreachable")
    },
  ])
    assert.equal(await verifyPreviewProviders(env, issuer, wrong), false)
})

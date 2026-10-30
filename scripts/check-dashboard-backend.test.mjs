import assert from "node:assert/strict"
import { test } from "node:test"
import { checkDashboardBackend } from "./check-dashboard-backend.mjs"

test("preview checks fail on missing backend functions rather than accepting a reachable deployment", async () => {
  await assert.rejects(
    checkDashboardBackend("https://dev.convex.cloud", async () =>
      Response.json({
        status: "error",
        errorMessage:
          "Could not find public function for 'accountBilling:overview'.",
      })
    ),
    /accountBilling:overview is missing/
  )
  const paths = []
  assert.equal(
    await checkDashboardBackend(
      "https://dev.convex.cloud",
      async (_url, init) => {
        const body = JSON.parse(init.body)
        paths.push(body.path)
        assert.equal(init.headers.Authorization, undefined)
        return Response.json({
          status: "error",
          errorMessage: "You must be signed in.",
        })
      }
    ),
    "dev.convex.cloud"
  )
  assert.deepEqual(paths, [
    "accountBilling:overview",
    "billingCatalogue:access",
    "billingPortalActions:profile",
    "premiumActions:offer",
  ])
  await assert.rejects(
    checkDashboardBackend("http://dev.convex.cloud"),
    /NEXT_PUBLIC_CONVEX_URL/
  )
  await assert.rejects(
    checkDashboardBackend("https://dev.convex.cloud", async () =>
      Response.json({ status: "success" })
    ),
    /expected authentication guard/
  )
})

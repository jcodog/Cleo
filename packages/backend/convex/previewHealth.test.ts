import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { test } from "node:test"
import { convexTest } from "convex-test"
import { internal } from "./_generated/api"
import schema from "./schema"

test("internal Preview provider proof checks the stamp and isolation before contacting providers", async (t) => {
  const build = {
    sha: "a".repeat(40),
    branch: "review",
    url: "https://review.convex.cloud",
    issuer: "https://review.clerk.accounts.dev",
    origin: "https://review.example.com",
  }
  const fixtureEnv = {
    CONVEX_CLOUD_URL: build.url,
    CLERK_JWT_ISSUER_DOMAIN: build.issuer,
    CLERK_SECRET_KEY: "sk_test_fixture",
    CLEO_DASHBOARD_ORIGIN: build.origin,
    STRIPE_TEST_CHECKOUT_ENABLED: "false",
    STRIPE_CATALOGUE_WRITES_ENABLED: "false",
  }
  const previousEnv = process.env
  process.env = { ...fixtureEnv }
  t.after(() => {
    process.env = previousEnv
  })

  let calls = 0
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls++
    assert.equal(url, "https://api.clerk.com/v1/domains")
    return Response.json({ data: [{ frontend_api_url: build.issuer }] })
  })

  // Replace the deploy-time source stamp while executing the real registered action.
  const stamp = `data:text/javascript,${encodeURIComponent(`export const previewBuild = ${JSON.stringify(build)}`)}`
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        specifier === "./previewVersion" &&
        context.parentURL ===
          new URL("./previewHealth.ts", import.meta.url).href
      )
        return { url: stamp, shortCircuit: true }
      return nextResolve(specifier, context)
    },
  })
  t.after(() => hooks.deregister())
  const f = convexTest(schema, {
    "./_generated/server.js": () => import("./_generated/server.js"),
    "./previewHealth.ts": () => import("./previewHealth"),
  })
  const verify = (sha = build.sha, url = build.url) =>
    f.action(internal.previewHealth.verifyProviders, { sha, url })

  assert.equal(await verify("b".repeat(40)), false)
  assert.equal(await verify(build.sha, "https://other.convex.cloud"), false)
  Object.assign(process.env, { STRIPE_CATALOGUE_WRITES_ENABLED: "true" })
  assert.equal(await verify(), false)
  assert.equal(calls, 0)

  Object.assign(process.env, fixtureEnv)
  assert.equal(await verify(), true)
  assert.equal(calls, 1)
})

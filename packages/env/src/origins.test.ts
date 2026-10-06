import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveWebOrigin } from "./origins"

test("site and application origins stay distinct in production, previews and local development", () => {
  assert.equal(
    resolveWebOrigin({
      configuredUrl: "https://cleoai.cloud/",
      localOrigin: "http://localhost:3001",
    }),
    "https://cleoai.cloud"
  )
  assert.equal(
    resolveWebOrigin({
      configuredUrl: "https://app.cleoai.cloud",
      vercelUrl: "app-preview.vercel.app",
      localOrigin: "https://localhost:3000",
    }),
    "https://app.cleoai.cloud"
  )
  assert.equal(
    resolveWebOrigin({
      configuredUrl: undefined,
      vercelUrl: "app-preview.vercel.app",
      localOrigin: "https://localhost:3000",
    }),
    "https://app-preview.vercel.app"
  )
  assert.equal(
    resolveWebOrigin({
      configuredUrl: undefined,
      vercelUrl: "landing-preview.vercel.app",
      localOrigin: "http://localhost:3001",
    }),
    "https://landing-preview.vercel.app"
  )
  assert.equal(
    resolveWebOrigin({
      configuredUrl: undefined,
      localOrigin: "https://localhost:3000",
    }),
    "https://localhost:3000"
  )
  assert.equal(
    resolveWebOrigin({
      configuredUrl: "",
      localOrigin: "http://localhost:3001",
    }),
    "http://localhost:3001"
  )
  assert.equal(
    resolveWebOrigin({
      configuredUrl: "https://localhost:3000",
      localOrigin: "https://localhost:3000",
    }),
    "https://localhost:3000"
  )
})

test("landing environment loads without Clerk or Convex credentials", async () => {
  const { landingEnv } = await import("./landing")
  assert.ok("NEXT_PUBLIC_SITE_URL" in landingEnv)
  assert.ok("NEXT_PUBLIC_APP_URL" in landingEnv)
  assert.equal("CLERK_SECRET_KEY" in landingEnv, false)
  assert.equal("NEXT_PUBLIC_CONVEX_URL" in landingEnv, false)
})

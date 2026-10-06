import assert from "node:assert/strict"
import { test } from "node:test"
import { NextRequest } from "next/server"

test("actual server entry uses Clerk and a Convex token, rejects missing tokens and propagates backend failures", async (t) => {
  let userId: string | null = null
  let token: string | null = "convex-jwt"
  let audience: string | string[] = "other"
  let tokenOptions: unknown
  let reads = 0
  let backendFailure = false
  let state:
    | { status: "accountSyncPending" }
    | {
        status: "ready"
        account: {
          onboardingCompletedAt: number | null
          onboardingVersion: number | null
          onboardingProvenance: "post-rollout"
        }
      } = { status: "accountSyncPending" }
  const auth = Object.assign(async () => ({ userId }), {
    protect: async () => ({
      sessionClaims: { aud: audience },
      getToken: async (options: unknown) => {
        tokenOptions = options
        return token
      },
    }),
  })
  t.mock.module("@clerk/nextjs/server", {
    exports: { auth, clerkMiddleware: (handler: unknown) => handler },
  })
  t.mock.module("convex/nextjs", {
    exports: {
      fetchQuery: async (
        _query: unknown,
        _args: unknown,
        options: { token: string }
      ) => {
        reads++
        assert.equal(options.token, "convex-jwt")
        if (backendFailure) throw new Error("backend unavailable")
        return state
      },
    },
  })
  t.mock.module("next/navigation", {
    exports: {
      redirect: (path: string) => {
        throw new Error(`redirect:${path}`)
      },
    },
  })
  const { default: root } = await import("../../app/page")
  await assert.rejects(root(), { message: "redirect:/sign-in" })
  assert.equal(reads, 0)
  userId = "user_123"
  await assert.rejects(root(), { message: "redirect:/onboarding" })
  assert.deepEqual(tokenOptions, { template: "convex" })
  state = {
    status: "ready",
    account: {
      onboardingCompletedAt: null,
      onboardingVersion: null,
      onboardingProvenance: "post-rollout",
    },
  }
  await assert.rejects(root(), { message: "redirect:/onboarding" })
  state.account.onboardingCompletedAt = 1
  state.account.onboardingVersion = 1
  audience = ["convex"]
  await assert.rejects(root(), { message: "redirect:/dashboard" })
  assert.equal(tokenOptions, undefined)
  audience = "convex"
  await assert.rejects(root(), { message: "redirect:/dashboard" })
  t.mock.module(
    new URL("../onboarding/OnboardingExperience.tsx", import.meta.url).href,
    { exports: { OnboardingExperience: () => null } }
  )
  const { default: onboarding } =
    await import("../../app/(onboarding)/onboarding/page")
  await assert.rejects(
    onboarding({
      searchParams: Promise.resolve({ returnTo: "/twitch?tab=chat" }),
    }),
    { message: "redirect:/twitch?tab=chat" }
  )
  for (const returnTo of [
    "//evil.example",
    "/sign-in",
    "/onboarding",
    ["/twitch", "/staff"],
  ]) {
    await assert.rejects(
      onboarding({ searchParams: Promise.resolve({ returnTo }) }),
      { message: "redirect:/dashboard" }
    )
  }
  token = null
  await assert.rejects(root(), {
    message: "Clerk did not return a Convex authentication token",
  })
  token = "convex-jwt"
  backendFailure = true
  await assert.rejects(root(), { message: "backend unavailable" })
})

test("actual dashboard proxy keeps signed-out deep links and overwrites untrusted return headers", async (t) => {
  let userId: string | null = null
  t.mock.module("@clerk/nextjs/server", {
    exports: { clerkMiddleware: (handler: unknown) => handler },
  })
  const { default: proxy } = await import("../../proxy")
  // The middleware wrapper is mocked; NextRequest/NextResponse are the real framework objects.
  const handler = proxy as unknown as (
    auth: () => Promise<{ userId: string | null }>,
    request: NextRequest
  ) => Promise<Response>
  const auth = async () => ({ userId })
  for (const path of [
    "/dashboard/123/logs?tab=a%26b",
    "/twitch?tab=chat",
    "/staff/support-tickets",
  ]) {
    const response = await handler(
      auth,
      new NextRequest(`https://app.cleoai.cloud${path}`)
    )
    const location = new URL(response.headers.get("location") ?? "")
    assert.equal(location.origin, "https://app.cleoai.cloud")
    assert.equal(location.pathname, "/sign-in")
    assert.equal(location.searchParams.get("returnTo"), path)
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow")
  }
  userId = "user_123"
  const response = await handler(
    auth,
    new NextRequest("https://app.cleoai.cloud/twitch?tab=chat", {
      headers: { "x-cleo-return-path": "//evil.example" },
    })
  )
  assert.equal(
    response.headers.get("x-middleware-request-x-cleo-return-path"),
    "/twitch?tab=chat"
  )
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow")
  assert.equal(response.headers.get("location"), null)
  userId = null
  assert.equal(
    (
      await handler(auth, new NextRequest("https://app.cleoai.cloud/"))
    ).headers.get("location"),
    null
  )
  const { default: robots } = await import("../../app/robots")
  assert.deepEqual(robots(), { rules: { userAgent: "*", allow: "/" } })
})

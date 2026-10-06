import assert from "node:assert/strict"
import { test } from "node:test"
import {
  applicationEntryPath,
  getProductReturnPath,
  onboardingPath,
  signInPath,
} from "./applicationEntry"

test("application entry routes incomplete, syncing and unresolved accounts through onboarding", () => {
  assert.equal(applicationEntryPath(undefined), "/onboarding")
  assert.equal(
    applicationEntryPath({ status: "accountSyncPending" }),
    "/onboarding"
  )
  for (const onboardingProvenance of [
    null,
    "pre-rollout",
    "post-rollout",
  ] as const) {
    assert.equal(
      applicationEntryPath({
        status: "ready",
        account: {
          onboardingCompletedAt: null,
          onboardingVersion: null,
          onboardingProvenance,
        },
      }),
      "/onboarding"
    )
  }
  assert.equal(
    applicationEntryPath({
      status: "ready",
      account: {
        onboardingCompletedAt: 1,
        onboardingVersion: 0,
        onboardingProvenance: "post-rollout",
      },
    }),
    "/onboarding"
  )
  assert.equal(
    applicationEntryPath({
      status: "ready",
      account: {
        onboardingCompletedAt: 1,
        onboardingVersion: 1,
        onboardingProvenance: "post-rollout",
      },
    }),
    "/dashboard"
  )
})

test("deep links retain queries across sign in and onboarding", () => {
  for (const path of [
    "/dashboard/123/logs?filter=a%26b&tab=logs",
    "/twitch?tab=chat",
    "/staff/support-tickets?status=open",
  ]) {
    assert.equal(
      new URLSearchParams(signInPath(path).split("?")[1]).get("returnTo"),
      path
    )
    assert.equal(
      new URLSearchParams(onboardingPath(path).split("?")[1]).get("returnTo"),
      path
    )
  }
  assert.equal(signInPath(null), "/sign-in")
  assert.equal(onboardingPath(null), "/onboarding")
})

test("return paths reject external redirects, auth loops and public routes", () => {
  for (const path of [
    null,
    "https://evil.example",
    "//evil.example",
    "/%2fevil.example",
    "/%5cevil.example",
    "/\\evil.example",
    "/%0aevil",
    "/%ZZ",
    "/sign-in",
    "/sso-callback",
    "/onboarding?returnTo=/twitch",
    "/",
    "/pricing",
    "/dashboard/../../sign-in",
  ]) {
    assert.equal(getProductReturnPath(path), null, String(path))
    assert.equal(onboardingPath(path), "/onboarding", String(path))
  }
})

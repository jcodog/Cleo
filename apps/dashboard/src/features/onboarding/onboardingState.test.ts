import assert from "node:assert/strict"
import test from "node:test"

import {
  getOnboardingExperienceState,
  getOnboardingGuardDecision,
  type OnboardingQueryState,
} from "./onboardingState"

function newAccount(): OnboardingQueryState {
  return {
    status: "ready",
    account: {
      onboardingCompletedAt: null,
      onboardingProvenance: "post-rollout",
      onboardingVersion: null,
    },
  }
}

test("a new user with manageable guilds still sees onboarding", () => {
  const onboarding = newAccount()

  assert.equal(getOnboardingGuardDecision(onboarding), "show-onboarding")
  assert.equal(
    getOnboardingExperienceState({
      guildCount: 2,
      onboarding,
      syncStatus: "ready",
    }),
    "ready-with-guilds"
  )
})

test("a new user without guilds sees the add-server onboarding state", () => {
  const onboarding = newAccount()

  assert.equal(getOnboardingGuardDecision(onboarding), "show-onboarding")
  assert.equal(
    getOnboardingExperienceState({
      guildCount: 0,
      onboarding,
      syncStatus: "ready",
    }),
    "ready-without-guilds"
  )
})

test("an empty guild list is not final before successful hydration", () => {
  assert.equal(
    getOnboardingExperienceState({
      guildCount: 0,
      onboarding: newAccount(),
      syncStatus: "syncing",
    }),
    "loading"
  )
  assert.equal(
    getOnboardingExperienceState({
      guildCount: 0,
      onboarding: newAccount(),
      syncStatus: "error",
    }),
    "error"
  )
})

test("a completed returning user bypasses onboarding", () => {
  const onboarding: OnboardingQueryState = {
    status: "ready",
    account: {
      onboardingCompletedAt: 123,
      onboardingProvenance: "post-rollout",
      onboardingVersion: 2,
    },
  }

  assert.equal(getOnboardingGuardDecision(onboarding), "allow-dashboard")
  assert.equal(
    getOnboardingExperienceState({
      guildCount: 0,
      onboarding,
      syncStatus: "ready",
    }),
    "redirect-dashboard"
  )
})

test("an unclassified account requires durable provenance resolution", () => {
  assert.equal(
    getOnboardingGuardDecision({
      status: "ready",
      account: {
        onboardingCompletedAt: null,
        onboardingProvenance: null,
        onboardingVersion: null,
      },
    }),
    "resolve-provenance"
  )
})

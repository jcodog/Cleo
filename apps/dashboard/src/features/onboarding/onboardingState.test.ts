import assert from "node:assert/strict"
import test from "node:test"

import {
  getOnboardingExperienceState,
  getOnboardingGuardDecision,
  getOnboardingGuardView,
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
      provenanceResolutionStatus: "idle",
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
      provenanceResolutionStatus: "idle",
      syncStatus: "ready",
    }),
    "ready-without-guilds"
  )
})

test("onboarding can render while account sync is still finishing", () => {
  assert.equal(
    getOnboardingExperienceState({
      guildCount: undefined,
      onboarding: undefined,
      provenanceResolutionStatus: "idle",
      syncStatus: "syncing",
    }),
    "syncing-account"
  )

  assert.equal(
    getOnboardingExperienceState({
      guildCount: undefined,
      onboarding: { status: "accountSyncPending" },
      provenanceResolutionStatus: "idle",
      syncStatus: "syncing",
    }),
    "syncing-account"
  )
})

test("server discovery stays inside onboarding instead of blocking the page", () => {
  assert.equal(
    getOnboardingExperienceState({
      guildCount: 0,
      onboarding: newAccount(),
      provenanceResolutionStatus: "idle",
      syncStatus: "syncing",
    }),
    "syncing-guilds"
  )
})

test("failed account or guild hydration exposes a retry state", () => {
  assert.equal(
    getOnboardingExperienceState({
      guildCount: undefined,
      onboarding: undefined,
      provenanceResolutionStatus: "idle",
      syncStatus: "error",
    }),
    "error"
  )

  assert.equal(
    getOnboardingExperienceState({
      guildCount: 0,
      onboarding: newAccount(),
      provenanceResolutionStatus: "idle",
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
      provenanceResolutionStatus: "idle",
      syncStatus: "ready",
    }),
    "redirect-dashboard"
  )
})

test("an unclassified account requires durable provenance resolution", () => {
  const onboarding: OnboardingQueryState = {
    status: "ready",
    account: {
      onboardingCompletedAt: null,
      onboardingProvenance: null,
      onboardingVersion: null,
    },
  }

  assert.equal(getOnboardingGuardDecision(onboarding), "resolve-provenance")
  assert.equal(
    getOnboardingExperienceState({
      guildCount: undefined,
      onboarding,
      provenanceResolutionStatus: "resolving",
      syncStatus: "syncing",
    }),
    "syncing-account"
  )
})

test("the guard mounts dashboard content only after it is allowed", () => {
  assert.equal(
    getOnboardingGuardView({
      decision: "resolve-provenance",
      provenanceResolutionStatus: "resolving",
    }),
    "pending"
  )
  assert.equal(
    getOnboardingGuardView({
      decision: "allow-dashboard",
      provenanceResolutionStatus: "idle",
    }),
    "allow-dashboard"
  )
})

test("a provenance failure exposes retry and cannot be erased by guild hydration", () => {
  assert.equal(
    getOnboardingGuardView({
      decision: "resolve-provenance",
      provenanceResolutionStatus: "error",
    }),
    "retry-provenance"
  )
  assert.equal(
    getOnboardingExperienceState({
      guildCount: 2,
      onboarding: {
        status: "ready",
        account: {
          onboardingCompletedAt: null,
          onboardingProvenance: null,
          onboardingVersion: null,
        },
      },
      provenanceResolutionStatus: "error",
      syncStatus: "ready",
    }),
    "error"
  )
})

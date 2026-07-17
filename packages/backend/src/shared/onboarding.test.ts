import assert from "node:assert/strict"
import test from "node:test"

import {
  CURRENT_ONBOARDING_VERSION,
  ONBOARDING_ROLLOUT_AT,
  getOnboardingProvenance,
  isCurrentOnboardingComplete,
} from "./onboarding"

test("onboarding provenance distinguishes genuine legacy accounts", () => {
  assert.equal(
    getOnboardingProvenance(ONBOARDING_ROLLOUT_AT - 1),
    "pre-rollout"
  )
  assert.equal(getOnboardingProvenance(ONBOARDING_ROLLOUT_AT), "post-rollout")
})

test("current or newer onboarding versions are complete", () => {
  assert.equal(
    isCurrentOnboardingComplete({
      onboardingCompletedAt: 100,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
    }),
    true
  )
  assert.equal(
    isCurrentOnboardingComplete({
      onboardingCompletedAt: 100,
      onboardingVersion: CURRENT_ONBOARDING_VERSION + 1,
    }),
    true
  )
  assert.equal(
    isCurrentOnboardingComplete({
      onboardingCompletedAt: null,
      onboardingVersion: CURRENT_ONBOARDING_VERSION + 1,
    }),
    false
  )
})

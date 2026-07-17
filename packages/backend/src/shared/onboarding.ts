export const CURRENT_ONBOARDING_VERSION = 1

// The first onboarding implementation landed on 17 July 2026. Accounts created
// before this point predate the rollout and can be migrated without first-run UI.
export const ONBOARDING_ROLLOUT_AT = 1_784_293_751_000

export type OnboardingProvenance = "pre-rollout" | "post-rollout"

export function getOnboardingProvenance(
  createdAt: number
): OnboardingProvenance {
  return createdAt < ONBOARDING_ROLLOUT_AT ? "pre-rollout" : "post-rollout"
}

export function isCurrentOnboardingComplete({
  onboardingCompletedAt,
  onboardingVersion,
}: {
  onboardingCompletedAt?: number | null
  onboardingVersion?: number | null
}): boolean {
  return (
    onboardingCompletedAt !== null &&
    onboardingCompletedAt !== undefined &&
    (onboardingVersion ?? 0) >= CURRENT_ONBOARDING_VERSION
  )
}

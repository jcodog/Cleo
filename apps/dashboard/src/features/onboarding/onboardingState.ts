import { isCurrentOnboardingComplete } from "@workspace/backend/shared/onboarding"

import type { DashboardDiscordSyncStatus } from "@/features/app-shell/DashboardDiscordHydrator"

type OnboardingAccount = {
  onboardingCompletedAt: number | null
  onboardingProvenance: "pre-rollout" | "post-rollout" | null
  onboardingVersion: number | null
}

export type OnboardingQueryState =
  | undefined
  | { status: "accountSyncPending" }
  | { status: "ready"; account: OnboardingAccount }

export type OnboardingGuardDecision =
  "loading" | "resolve-provenance" | "allow-dashboard" | "show-onboarding"

export function getOnboardingGuardDecision(
  onboarding: OnboardingQueryState
): OnboardingGuardDecision {
  if (!onboarding || onboarding.status !== "ready") {
    return "loading"
  }

  if (onboarding.account.onboardingProvenance === null) {
    return "resolve-provenance"
  }

  return isCurrentOnboardingComplete(onboarding.account)
    ? "allow-dashboard"
    : "show-onboarding"
}

export type OnboardingExperienceState =
  | "syncing-account"
  | "syncing-guilds"
  | "error"
  | "redirect-dashboard"
  | "ready-with-guilds"
  | "ready-without-guilds"

export function getOnboardingExperienceState({
  guildCount,
  onboarding,
  syncStatus,
}: {
  guildCount: number | undefined
  onboarding: OnboardingQueryState
  syncStatus: DashboardDiscordSyncStatus
}): OnboardingExperienceState {
  if (syncStatus === "error") {
    return "error"
  }

  if (!onboarding || onboarding.status !== "ready") {
    return "syncing-account"
  }

  if (onboarding.account.onboardingProvenance === null) {
    return "syncing-account"
  }

  if (isCurrentOnboardingComplete(onboarding.account)) {
    return "redirect-dashboard"
  }

  if (syncStatus !== "ready" || guildCount === undefined) {
    return "syncing-guilds"
  }

  return guildCount > 0 ? "ready-with-guilds" : "ready-without-guilds"
}

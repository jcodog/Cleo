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

export type ProvenanceResolutionStatus = "idle" | "resolving" | "error"

export type OnboardingGuardView =
  "pending" | "retry-provenance" | "allow-dashboard" | "redirect-onboarding"

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

export function getOnboardingGuardView({
  decision,
  provenanceResolutionStatus,
}: {
  decision: OnboardingGuardDecision
  provenanceResolutionStatus: ProvenanceResolutionStatus
}): OnboardingGuardView {
  if (decision === "allow-dashboard") {
    return "allow-dashboard"
  }

  if (decision === "show-onboarding") {
    return "redirect-onboarding"
  }

  return provenanceResolutionStatus === "error" ? "retry-provenance" : "pending"
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
  provenanceResolutionStatus,
  syncStatus,
}: {
  guildCount: number | undefined
  onboarding: OnboardingQueryState
  provenanceResolutionStatus: ProvenanceResolutionStatus
  syncStatus: DashboardDiscordSyncStatus
}): OnboardingExperienceState {
  if (provenanceResolutionStatus === "error") {
    return "error"
  }

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

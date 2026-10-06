import {
  getOnboardingGuardDecision,
  type OnboardingQueryState,
} from "@/features/onboarding/onboardingState"
import { getSafeInternalPath, withReturnTo } from "./safeRedirect"
import { isProtectedAppPath } from "@workspace/shared/appRoutes"

export function applicationEntryPath(
  onboarding: OnboardingQueryState
): "/dashboard" | "/onboarding" {
  return getOnboardingGuardDecision(onboarding) === "allow-dashboard"
    ? "/dashboard"
    : "/onboarding"
}

export function getProductReturnPath(value: string | null): string | null {
  const safePath = getSafeInternalPath(value)
  return safePath &&
    isProtectedAppPath(new URL(safePath, "https://cleo.local").pathname) &&
    !new URL(safePath, "https://cleo.local").pathname.startsWith("/onboarding")
    ? safePath
    : null
}

export function signInPath(returnTo: string | null): string {
  const safePath = getSafeInternalPath(returnTo)
  return safePath ? withReturnTo("/sign-in", safePath) : "/sign-in"
}

export function onboardingPath(returnTo: string | null): string {
  const safePath = getProductReturnPath(returnTo)
  return safePath ? withReturnTo("/onboarding", safePath) : "/onboarding"
}

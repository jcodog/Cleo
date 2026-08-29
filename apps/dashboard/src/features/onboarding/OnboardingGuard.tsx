"use client"

import { useEffect, useRef } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  type Preloaded,
  useConvexAuth,
  useMutation,
  usePreloadedQuery,
} from "convex/react"
import { redirect } from "next/navigation"

import { DashboardDiscordHydrator } from "@/features/app-shell/DashboardDiscordHydrator"
import { getOnboardingGuardDecision } from "@/features/onboarding/onboardingState"

export function OnboardingGuard({
  children,
  preloadedOnboarding,
}: {
  children: React.ReactNode
  preloadedOnboarding: Preloaded<
    typeof api.queries.dashboard.account.onboarding.get
  >
}) {
  const onboarding = usePreloadedQuery(preloadedOnboarding)
  const { isAuthenticated } = useConvexAuth()
  const resolveProvenance = useMutation(
    api.mutations.dashboard.account.onboarding.resolveProvenance
  )
  const provenanceResolutionStarted = useRef(false)
  const decision = getOnboardingGuardDecision(onboarding)

  useEffect(() => {
    if (
      decision !== "resolve-provenance" ||
      !isAuthenticated ||
      provenanceResolutionStarted.current
    ) {
      return
    }

    provenanceResolutionStarted.current = true
    void resolveProvenance({}).catch(() => {
      provenanceResolutionStarted.current = false
    })
  }, [decision, isAuthenticated, resolveProvenance])

  if (decision === "show-onboarding") {
    redirect("/onboarding")
  }

  return (
    <>
      <DashboardDiscordHydrator />
      {children}
    </>
  )
}

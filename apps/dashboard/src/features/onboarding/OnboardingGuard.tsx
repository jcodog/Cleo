"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  type Preloaded,
  useConvexAuth,
  useMutation,
  usePreloadedQuery,
} from "convex/react"
import { redirect } from "next/navigation"
import { Button } from "@workspace/ui/components/button"

import { DashboardDiscordHydrator } from "@/features/app-shell/DashboardDiscordHydrator"
import {
  getOnboardingGuardDecision,
  getOnboardingGuardView,
  type ProvenanceResolutionStatus,
} from "@/features/onboarding/onboardingState"

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
  const [provenanceResolutionStatus, setProvenanceResolutionStatus] =
    useState<ProvenanceResolutionStatus>("idle")
  const decision = getOnboardingGuardDecision(onboarding)
  const view = getOnboardingGuardView({
    decision,
    provenanceResolutionStatus,
  })

  useEffect(() => {
    if (
      decision !== "resolve-provenance" ||
      !isAuthenticated ||
      provenanceResolutionStatus !== "idle" ||
      provenanceResolutionStarted.current
    ) {
      return
    }

    provenanceResolutionStarted.current = true
    setProvenanceResolutionStatus("resolving")
    void resolveProvenance({}).catch(() => {
      provenanceResolutionStarted.current = false
      setProvenanceResolutionStatus("error")
    })
  }, [decision, isAuthenticated, provenanceResolutionStatus, resolveProvenance])

  if (view === "redirect-onboarding") {
    redirect("/onboarding")
  }

  function retryProvenanceResolution() {
    provenanceResolutionStarted.current = false
    setProvenanceResolutionStatus("idle")
  }

  return (
    <>
      <DashboardDiscordHydrator />
      {view === "allow-dashboard" ? children : null}
      {view === "retry-provenance" ? (
        <main className="flex min-h-svh items-center justify-center px-6">
          <div className="max-w-md text-center" role="alert">
            <h1 className="font-heading text-2xl font-medium">
              Account setup needs another try
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Cleo could not finish checking this account's onboarding status.
              Retry without leaving the dashboard.
            </p>
            <Button className="mt-6" onClick={retryProvenanceResolution}>
              Try again
            </Button>
          </div>
        </main>
      ) : null}
    </>
  )
}

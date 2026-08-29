"use client"

import { useEffect, useRef } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"

import { DashboardDiscordHydrator } from "@/features/app-shell/DashboardDiscordHydrator"
import { getOnboardingGuardDecision } from "@/features/onboarding/onboardingState"

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const onboarding = useQuery(api.queries.dashboard.account.onboarding.get)
  const resolveProvenance = useMutation(
    api.mutations.dashboard.account.onboarding.resolveProvenance
  )
  const provenanceResolutionStarted = useRef(false)
  const decision = getOnboardingGuardDecision(onboarding)

  useEffect(() => {
    if (decision === "show-onboarding") {
      router.replace("/onboarding")
      return
    }

    if (
      decision !== "resolve-provenance" ||
      provenanceResolutionStarted.current
    ) {
      return
    }

    provenanceResolutionStarted.current = true
    void resolveProvenance({}).catch(() => {
      provenanceResolutionStarted.current = false
    })
  }, [decision, resolveProvenance, router])

  return (
    <>
      <DashboardDiscordHydrator />
      {children}
    </>
  )
}

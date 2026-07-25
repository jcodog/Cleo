"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IconRefresh } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { isCurrentOnboardingComplete } from "@workspace/backend/shared/onboarding"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"

import {
  DashboardDiscordHydrator,
  type DashboardDiscordSyncStatus,
} from "@/features/app-shell/DashboardDiscordHydrator"

import { getOnboardingGuardDecision } from "@/features/onboarding/onboardingState"

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const onboarding = useQuery(api.queries.dashboard.account.onboarding.get)
  const resolveProvenance = useMutation(
    api.mutations.dashboard.account.onboarding.resolveProvenance
  )
  const [syncStatus, setSyncStatus] =
    useState<DashboardDiscordSyncStatus>("idle")
  const [retryToken, setRetryToken] = useState(0)
  const [provenanceError, setProvenanceError] = useState(false)
  const provenanceResolutionStarted = useRef(false)
  const handleStatusChange = useCallback(
    (status: DashboardDiscordSyncStatus) => setSyncStatus(status),
    []
  )
  const decision = getOnboardingGuardDecision(onboarding)
  const isComplete =
    onboarding?.status === "ready" &&
    isCurrentOnboardingComplete(onboarding.account)

  useEffect(() => {
    if (decision === "loading" || decision === "allow-dashboard") {
      return
    }

    if (decision === "show-onboarding") {
      router.replace("/onboarding")
      return
    }

    if (provenanceResolutionStarted.current) {
      return
    }

    provenanceResolutionStarted.current = true
    setProvenanceError(false)

    void resolveProvenance({}).catch(() => {
      provenanceResolutionStarted.current = false
      setProvenanceError(true)
    })
  }, [decision, resolveProvenance, retryToken, router])

  return (
    <>
      <DashboardDiscordHydrator
        onStatusChange={handleStatusChange}
        retryToken={retryToken}
      />
      {isComplete ? (
        children
      ) : provenanceError ? (
        <GuardState
          action={
            <Button
              onClick={() => {
                setProvenanceError(false)
                provenanceResolutionStarted.current = false
                setRetryToken((value) => value + 1)
              }}
              variant="outline"
            >
              <IconRefresh aria-hidden data-icon="inline-start" />
              Try again
            </Button>
          }
          message="Cleo could not verify your onboarding status."
        />
      ) : syncStatus === "error" &&
        onboarding?.status === "accountSyncPending" ? (
        <GuardState
          action={
            <Button
              onClick={() => {
                setSyncStatus("idle")
                setRetryToken((value) => value + 1)
              }}
              variant="outline"
            >
              <IconRefresh aria-hidden data-icon="inline-start" />
              Try again
            </Button>
          }
          message="Cleo could not finish connecting your account."
        />
      ) : (
        <GuardState message="Preparing your Cleo account…" />
      )}
    </>
  )
}

function GuardState({
  action,
  message,
}: {
  action?: React.ReactNode
  message: string
}) {
  return (
    <main className="dark cleo-atmosphere flex min-h-svh items-center justify-center bg-background px-5 text-foreground">
      <div className="flex flex-col items-center gap-5 text-center">
        {!action ? <Spinner className="size-6 text-cleo-cyan" /> : null}
        <p className="text-sm text-muted-foreground">{message}</p>
        {action}
      </div>
    </main>
  )
}

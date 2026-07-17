"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IconRefresh } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"

import {
  DashboardDiscordHydrator,
  type DashboardDiscordSyncStatus,
} from "@/features/app-shell/DashboardDiscordHydrator"

const CURRENT_ONBOARDING_VERSION = 1

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const onboarding = useQuery(api.queries.dashboard.account.onboarding.get)
  const manageableGuilds = useQuery(
    api.queries.dashboard.discord.guilds.manageable.list
  )
  const completeOnboarding = useMutation(
    api.mutations.dashboard.account.onboarding.complete
  )
  const [syncStatus, setSyncStatus] =
    useState<DashboardDiscordSyncStatus>("idle")
  const [retryToken, setRetryToken] = useState(0)
  const [legacyCompletionError, setLegacyCompletionError] = useState(false)
  const legacyCompletionStarted = useRef(false)
  const handleStatusChange = useCallback(
    (status: DashboardDiscordSyncStatus) => setSyncStatus(status),
    []
  )
  const isComplete =
    onboarding?.status === "ready" &&
    onboarding.account.onboardingCompletedAt !== null &&
    (onboarding.account.onboardingVersion ?? 0) >= CURRENT_ONBOARDING_VERSION

  useEffect(() => {
    if (
      onboarding?.status !== "ready" ||
      isComplete ||
      manageableGuilds === undefined
    ) {
      return
    }

    if (manageableGuilds.length === 0) {
      router.replace("/onboarding")
      return
    }

    if (legacyCompletionStarted.current) {
      return
    }

    legacyCompletionStarted.current = true
    setLegacyCompletionError(false)

    void completeOnboarding({}).catch(() => {
      legacyCompletionStarted.current = false
      setLegacyCompletionError(true)
    })
  }, [
    completeOnboarding,
    isComplete,
    manageableGuilds,
    onboarding,
    retryToken,
    router,
  ])

  return (
    <>
      <DashboardDiscordHydrator
        onStatusChange={handleStatusChange}
        retryToken={retryToken}
      />
      {isComplete ? (
        children
      ) : legacyCompletionError ? (
        <GuardState
          action={
            <Button
              onClick={() => {
                setLegacyCompletionError(false)
                legacyCompletionStarted.current = false
                setRetryToken((value) => value + 1)
              }}
              variant="outline"
            >
              <IconRefresh aria-hidden data-icon="inline-start" />
              Try again
            </Button>
          }
          message="Cleo could not restore your dashboard access."
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

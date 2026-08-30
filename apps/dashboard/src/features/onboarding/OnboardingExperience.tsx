"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useUser } from "@clerk/nextjs"
import {
  IconArrowRight,
  IconBrandDiscord,
  IconCheck,
  IconRefresh,
  IconServer,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { isCurrentOnboardingComplete } from "@workspace/backend/shared/onboarding"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { useMutation, useQuery } from "convex/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { DotGrid } from "@/components/backgrounds/DotGrid"
import {
  DashboardDiscordHydrator,
  type DashboardDiscordSyncStatus,
} from "@/features/app-shell/DashboardDiscordHydrator"
import {
  getOnboardingExperienceState,
  type OnboardingExperienceState,
  type ProvenanceResolutionStatus,
} from "@/features/onboarding/onboardingState"

type ManageableGuild = {
  discordGuildId: string
  iconUrl?: string
  name: string
}

type ReadyOnboarding = Extract<
  NonNullable<
    ReturnType<
      typeof useQuery<typeof api.queries.dashboard.account.onboarding.get>
    >
  >,
  { status: "ready" }
>

export function OnboardingExperience() {
  const router = useRouter()
  const { user } = useUser()
  const onboarding = useQuery(api.queries.dashboard.account.onboarding.get)
  const guilds = useQuery(api.queries.dashboard.discord.guilds.manageable.list)
  const completeOnboarding = useMutation(
    api.mutations.dashboard.account.onboarding.complete
  )
  const resolveProvenance = useMutation(
    api.mutations.dashboard.account.onboarding.resolveProvenance
  )
  const [syncStatus, setSyncStatus] =
    useState<DashboardDiscordSyncStatus>("idle")
  const [provenanceResolutionStatus, setProvenanceResolutionStatus] =
    useState<ProvenanceResolutionStatus>("idle")
  const [retryToken, setRetryToken] = useState(0)
  const [destination, setDestination] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const provenanceResolutionStarted = useRef(false)
  const handleStatusChange = useCallback(
    (status: DashboardDiscordSyncStatus) => setSyncStatus(status),
    []
  )
  const readyOnboarding =
    onboarding?.status === "ready" &&
    onboarding.account.onboardingProvenance !== null
      ? onboarding
      : null
  const isAlreadyComplete =
    readyOnboarding !== null &&
    isCurrentOnboardingComplete(readyOnboarding.account)
  const experienceState = getOnboardingExperienceState({
    guildCount: guilds?.length,
    onboarding,
    provenanceResolutionStatus:
      onboarding?.status === "ready" &&
      onboarding.account.onboardingProvenance !== null
        ? "idle"
        : provenanceResolutionStatus,
    syncStatus,
  })

  useEffect(() => {
    if (
      onboarding?.status === "ready" &&
      onboarding.account.onboardingProvenance !== null
    ) {
      provenanceResolutionStarted.current = false
      return
    }

    if (
      onboarding?.status === "ready" &&
      onboarding.account.onboardingProvenance === null &&
      provenanceResolutionStatus === "idle" &&
      !provenanceResolutionStarted.current
    ) {
      provenanceResolutionStarted.current = true
      setProvenanceResolutionStatus("resolving")
      void resolveProvenance({}).catch(() => {
        provenanceResolutionStarted.current = false
        setProvenanceResolutionStatus("error")
      })
    }
  }, [onboarding, provenanceResolutionStatus, resolveProvenance, retryToken])

  useEffect(() => {
    if (isAlreadyComplete) {
      router.replace("/dashboard")
    }
  }, [isAlreadyComplete, router])

  async function continueTo(path: string) {
    if (!readyOnboarding || isAlreadyComplete) {
      return
    }

    setDestination(path)
    setErrorMessage(null)

    try {
      await completeOnboarding({})
      router.replace(path)
    } catch {
      setDestination(null)
      setErrorMessage("Cleo could not save your onboarding status. Try again.")
    }
  }

  function retrySync() {
    provenanceResolutionStarted.current = false
    setProvenanceResolutionStatus("idle")
    setSyncStatus("idle")
    setRetryToken((value) => value + 1)
  }

  if (isAlreadyComplete) {
    return null
  }

  return (
    <main className="dark cleo-atmosphere relative min-h-svh overflow-hidden bg-background text-foreground">
      <DashboardDiscordHydrator
        onStatusChange={handleStatusChange}
        retryToken={retryToken}
      />
      <div
        aria-hidden
        className="absolute top-1/2 right-[-16rem] size-[44rem] -translate-y-1/2 rounded-full border border-primary/12 shadow-[0_0_140px_color-mix(in_oklab,var(--primary)_9%,transparent)]"
      />
      <div className="pointer-events-none absolute top-0 right-0 h-72 w-full [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-30 lg:h-full lg:w-[52%] lg:[mask-image:radial-gradient(ellipse_at_center,black,transparent_76%)]">
        <DotGrid
          activeColor="#818cf8"
          baseColor="#164e63"
          dotSize={3}
          gap={30}
          idleColor="#22d3ee"
          idlePulseInterval={6.5}
          idlePulseRadius={84}
          idleStrength={0.24}
          proximity={110}
          shockStrength={0.8}
          speedTrigger={320}
        />
      </div>

      <div className="relative mx-auto flex min-h-svh w-full max-w-[90rem] flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-12 lg:py-9">
        <Link
          className="flex w-fit items-center gap-3 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/"
        >
          <Image
            alt=""
            className="size-9 rounded-full border border-white/15"
            height={36}
            src="/android-chrome-192x192.png"
            width={36}
          />
          <span className="font-heading text-xl font-semibold">Cleo</span>
        </Link>

        <OnboardingReady
          destination={destination}
          errorMessage={errorMessage}
          experienceState={experienceState}
          guilds={guilds}
          onContinue={continueTo}
          onboarding={readyOnboarding}
          onRetry={retrySync}
          userImageUrl={user?.imageUrl}
          userName={user?.fullName ?? user?.firstName ?? undefined}
        />
      </div>
    </main>
  )
}

function OnboardingReady({
  destination,
  errorMessage,
  experienceState,
  guilds,
  onContinue,
  onboarding,
  onRetry,
  userImageUrl,
  userName,
}: {
  destination: string | null
  errorMessage: string | null
  experienceState: OnboardingExperienceState
  guilds: ManageableGuild[] | undefined
  onContinue: (path: string) => Promise<void>
  onboarding: ReadyOnboarding | null
  onRetry: () => void
  userImageUrl?: string
  userName?: string
}) {
  const identity = onboarding?.discordIdentity
  const displayName =
    identity?.displayName ??
    identity?.username ??
    onboarding?.account.displayName ??
    userName ??
    "there"
  const avatarUrl =
    identity?.avatarUrl ?? onboarding?.account.imageUrl ?? userImageUrl
  const guildList = guilds ?? []
  const hasGuilds = experienceState === "ready-with-guilds"
  const panelTitle =
    experienceState === "syncing-account"
      ? "Finishing your setup"
      : experienceState === "syncing-guilds"
        ? "Finding your servers"
        : experienceState === "error"
          ? "Connection needs another try"
          : hasGuilds
            ? "Choose a server"
            : "Add your first server"
  const intro =
    experienceState === "syncing-account"
      ? "Your Discord sign-up is complete. Cleo is finishing the account setup needed for your dashboard."
      : experienceState === "syncing-guilds"
        ? "Your Cleo account is ready. We’re checking Discord for the servers you can manage."
        : experienceState === "error"
          ? "Your Discord account is connected, but Cleo could not finish loading your dashboard access."
          : hasGuilds
            ? "Cleo found servers you can manage. Choose where you want to start."
            : "Your account is ready. Add Cleo to a Discord server to open its workspace."

  return (
    <div className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24 lg:py-20">
      <section className="max-w-2xl">
        <p className="text-xs font-medium tracking-[0.18em] text-cleo-cyan uppercase">
          Welcome to Cleo
        </p>
        <div className="mt-6 flex items-center gap-4">
          {avatarUrl ? (
            <Image
              alt=""
              className="size-14 rounded-full border border-white/15 object-cover sm:size-16"
              height={64}
              src={avatarUrl}
              unoptimized
              width={64}
            />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-full border border-white/15 text-cleo-cyan sm:size-16">
              <IconBrandDiscord aria-hidden className="size-7" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-heading text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              {displayName}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <IconCheck aria-hidden className="size-4 text-emerald-400" />
              Discord account connected
            </p>
          </div>
        </div>
        <p className="mt-8 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          {intro}
        </p>
      </section>

      <section className="border-t border-white/12 pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-16">
        <h2 className="font-heading text-2xl font-medium sm:text-3xl">
          {panelTitle}
        </h2>

        {experienceState === "syncing-account" ? (
          <OnboardingProgress message="Creating your Cleo profile and linking your Discord identity." />
        ) : experienceState === "syncing-guilds" ? (
          <OnboardingProgress message="Checking Discord for servers where you have management access." />
        ) : experienceState === "error" ? (
          <div className="mt-6 max-w-md" role="alert">
            <p className="text-sm leading-6 text-muted-foreground">
              Nothing needs to be restarted. Retry the account and server sync
              from here.
            </p>
            <Button className="mt-5" onClick={onRetry} variant="outline">
              <IconRefresh aria-hidden data-icon="inline-start" />
              Try again
            </Button>
          </div>
        ) : hasGuilds ? (
          <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
            {guildList.map((guild) => {
              const path = `/dashboard/${guild.discordGuildId}`
              const isLoading = destination === path

              return (
                <button
                  className="flex min-h-16 w-full items-center gap-3 px-1 py-3 text-left transition-colors outline-none hover:bg-white/4 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                  disabled={destination !== null}
                  key={guild.discordGuildId}
                  onClick={() => void onContinue(path)}
                  type="button"
                >
                  {guild.iconUrl ? (
                    <Image
                      alt=""
                      className="size-10 rounded-lg object-cover"
                      height={40}
                      src={guild.iconUrl}
                      unoptimized
                      width={40}
                    />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-lg bg-white/6 text-sm font-medium">
                      {guild.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {guild.name}
                  </span>
                  {isLoading ? (
                    <Spinner />
                  ) : (
                    <IconArrowRight
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <Button
            className="mt-7 h-12 w-full sm:w-auto"
            disabled={destination !== null}
            onClick={() => void onContinue("/dashboard/add-server")}
            size="lg"
          >
            {destination === "/dashboard/add-server" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconServer aria-hidden data-icon="inline-start" />
            )}
            Add a Discord server
          </Button>
        )}

        {hasGuilds ? (
          <Button
            className="mt-6"
            disabled={destination !== null}
            onClick={() => void onContinue("/dashboard")}
            variant="ghost"
          >
            Open dashboard
          </Button>
        ) : null}

        {errorMessage ? (
          <p className="mt-5 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  )
}

function OnboardingProgress({ message }: { message: string }) {
  return (
    <div
      aria-live="polite"
      className="mt-6 flex max-w-md items-start gap-3 border-y border-white/10 py-5"
    >
      <Spinner className="mt-0.5 size-5 shrink-0 text-cleo-cyan" />
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  )
}

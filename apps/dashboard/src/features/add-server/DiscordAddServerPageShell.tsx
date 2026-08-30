"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconAlertCircle,
  IconBrandDiscord,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconServer,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { Id } from "@workspace/backend/convex/_generated/dataModel.js"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useAction,
  useConvexAuth,
  useQuery,
} from "convex/react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import {
  getNextInstallSessionExpiry,
  hasPendingInstall,
} from "./installSessionExpiry"

type InstallableGuild = {
  discordGuildId: string
  name: string
  iconUrl?: string
  iconHash?: string
  memberCount?: number
  presenceCount?: number
  isOwner?: boolean
  permissions?: string
  state:
    | "installed"
    | "installable"
    | "pending"
    | "verificationNeeded"
    | "unavailable"
    | "forbidden"
  unavailableReason?:
    | "missingManageGuildPermission"
    | "botLeft"
    | "botSyncUnavailable"
    | "verificationUnavailable"
    | "discordBotTokenUnavailable"
    | "discordApiUnavailable"
    | "discordRestDeniedAccess"
  installSessionId?: Id<"discordGuildInstallSessions">
  installSessionStatus?: "pending" | "bot_joined" | "configured" | "expired"
  installSessionExpiresAt?: number
  dashboardHref?: string
}

type InstallableGuildsResult =
  | {
      status: "missingDiscordIdentity"
    }
  | {
      status: "discordGuildDiscoveryUnavailable"
      reason:
        | "clerkSecretUnavailable"
        | "discordAccessTokenUnavailable"
        | "discordTokenResolutionUnavailable"
        | "discordGuildScopeUnavailable"
        | "discordApiUnavailable"
      guilds: InstallableGuild[]
    }
  | {
      status: "ready"
      guilds: InstallableGuild[]
    }

type FlowNotice = {
  tone: "default" | "destructive"
  title: string
  description: string
}

type ActiveInstall = {
  discordGuildId: string
  installSessionId: Id<"discordGuildInstallSessions">
  expiresAt: number
}

function DiscordAddServerState() {
  const router = useRouter()
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth()
  const currentUser = useQuery(api.queries.dashboard.account.currentUser.get)
  const listInstallableGuilds = useAction(
    api.actions.dashboard.discord.install.listInstallableGuilds.list
  )
  const createServerInstall = useAction(
    api.actions.dashboard.discord.install.createServerInstall.create
  )
  const completeServerInstall = useAction(
    api.actions.dashboard.discord.install.completeServerInstall.complete
  )
  const [guildResult, setGuildResult] =
    useState<InstallableGuildsResult | null>(null)
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null)
  const [activeInstall, setActiveInstall] = useState<ActiveInstall | null>(null)
  const [notice, setNotice] = useState<FlowNotice | null>(null)

  const activeInstallSession = useQuery(
    api.queries.dashboard.discord.install.context.getInstallSessionStatus,
    activeInstall === null
      ? "skip"
      : {
          installSessionId: activeInstall.installSessionId,
        }
  )

  const autoCompletingInstallSessionRef =
    useRef<Id<"discordGuildInstallSessions"> | null>(null)

  const discoveryAuthState = isConvexAuthLoading
    ? "loading"
    : isAuthenticated
      ? "authenticated"
      : "unauthenticated"

  useEffect(() => {
    if (discoveryAuthState === "loading") {
      return
    }

    if (discoveryAuthState === "unauthenticated") {
      return
    }

    let cancelled = false

    listInstallableGuilds({})
      .then((result) => {
        if (!cancelled) {
          setGuildResult(result)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotice({
            tone: "destructive",
            title: "Discord servers could not be loaded",
            description:
              "The dashboard could not check Discord install state. Refresh and try again.",
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [discoveryAuthState, listInstallableGuilds])

  useEffect(() => {
    if (
      activeInstall === null ||
      activeInstallSession === undefined ||
      activeInstallSession.status !== "ready" ||
      activeInstallSession.session.status !== "bot_joined"
    ) {
      return
    }

    const installSessionId = activeInstall.installSessionId

    if (autoCompletingInstallSessionRef.current === installSessionId) {
      return
    }

    autoCompletingInstallSessionRef.current = installSessionId

    setActiveGuildId(activeInstall.discordGuildId)
    setNotice(null)

    void completeServerInstall({
      installSessionId,
    })
      .then((result) => {
        if (result.status === "completed") {
          router.push(result.targetPath)
          return
        }

        setNotice(
          toCompleteNotice(
            result.status,
            "reason" in result ? result.reason : undefined
          )
        )
      })
      .catch(() => {
        setNotice({
          tone: "destructive",
          title: "Server install could not be completed",
          description:
            "Cleo could not finish verifying this server. Use Recheck to try again.",
        })
      })
      .finally(() => {
        setActiveGuildId((currentGuildId) =>
          currentGuildId === activeInstall.discordGuildId
            ? null
            : currentGuildId
        )
      })
  }, [activeInstall, activeInstallSession, completeServerInstall, router])

  const discoveredGuilds =
    guildResult !== null && "guilds" in guildResult ? guildResult.guilds : []

  const nextInstallSessionExpiry = getNextInstallSessionExpiry({
    activeInstallExpiresAt: activeInstall?.expiresAt,
    guilds: discoveredGuilds,
  })

  useEffect(() => {
    if (nextInstallSessionExpiry === null) {
      return
    }

    const timeoutId = window.setTimeout(
      () => {
        const now = Date.now()

        setActiveInstall((current) =>
          current !== null && current.expiresAt <= now ? null : current
        )
        setGuildResult((current) => {
          if (current === null || !("guilds" in current)) {
            return current
          }

          return {
            ...current,
            guilds: current.guilds.map((guild) =>
              guild.state === "pending" &&
              guild.installSessionExpiresAt !== undefined &&
              guild.installSessionExpiresAt <= now
                ? { ...guild, state: "installable" as const }
                : guild
            ),
          }
        })
      },
      Math.max(0, nextInstallSessionExpiry - Date.now()) + 1
    )

    return () => window.clearTimeout(timeoutId)
  }, [nextInstallSessionExpiry])

  async function startOrReopenInstall(guild: InstallableGuild) {
    setActiveGuildId(guild.discordGuildId)
    setNotice(null)

    const discordWindow = window.open("", "_blank")

    if (discordWindow) {
      discordWindow.opener = null
    }

    try {
      const result = await createServerInstall({
        discordGuildId: guild.discordGuildId,
      })

      if (result.status === "created") {
        setActiveInstall({
          discordGuildId: result.discordGuildId,
          installSessionId: result.installSessionId,
          expiresAt: result.expiresAt,
        })

        if (discordWindow && !discordWindow.closed) {
          discordWindow.location.replace(result.installUrl)
        } else {
          setNotice({
            tone: "default",
            title: "Open Discord to continue",
            description:
              "Your browser did not keep the Discord window open. Use Open Discord again to continue the installation.",
          })
        }

        return
      }

      discordWindow?.close()

      if (result.status === "alreadyInstalled") {
        router.push(result.targetPath)
        return
      }

      setNotice(
        toCreateNotice(
          result.status,
          "reason" in result ? result.reason : undefined
        )
      )
    } catch {
      discordWindow?.close()

      setNotice({
        tone: "destructive",
        title: "Discord install could not be started",
        description:
          "Cleo could not start the Discord installation. Try again.",
      })
    } finally {
      setActiveGuildId(null)
    }
  }

  if (
    currentUser === undefined ||
    isConvexAuthLoading ||
    (discoveryAuthState === "authenticated" && guildResult === null)
  ) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (guildResult === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (guildResult.status === "missingDiscordIdentity") {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconBrandDiscord aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Discord account unavailable</EmptyTitle>
          <EmptyDescription>
            Cleo checked Clerk for this signed-in session, but Clerk did not
            return Discord account data for server discovery.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const guilds = guildResult.guilds.map((guild) => {
    if (
      activeInstall !== null &&
      guild.discordGuildId === activeInstall.discordGuildId &&
      activeInstallSession?.status === "notFound"
    ) {
      return { ...guild, state: "installable" as const }
    }

    if (
      activeInstall === null ||
      guild.discordGuildId !== activeInstall.discordGuildId ||
      guild.state === "installed"
    ) {
      return guild
    }

    return {
      ...guild,
      state: "pending" as const,
      installSessionId: activeInstall.installSessionId,
      installSessionStatus:
        activeInstallSession?.status === "ready"
          ? activeInstallSession.session.status
          : ("pending" as const),
      installSessionExpiresAt: activeInstall.expiresAt,
    }
  })
  const installFlowGuilds = guilds.filter(
    (guild) => guild.state === "installable" || guild.state === "pending"
  )
  const installedGuilds = guilds.filter((guild) => guild.state === "installed")
  const newInstallDisabled = hasPendingInstall(guilds)

  return (
    <div className="flex flex-col gap-4">
      {guildResult.status === "discordGuildDiscoveryUnavailable" ? (
        <Alert>
          <IconAlertCircle aria-hidden />
          <AlertTitle>Live Discord discovery unavailable</AlertTitle>
          <AlertDescription>
            {getGuildDiscoveryUnavailableCopy(guildResult.reason)}
          </AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert variant={notice.tone}>
          <IconAlertCircle aria-hidden />
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.description}</AlertDescription>
        </Alert>
      ) : null}

      {installFlowGuilds.length > 0 ? (
        <GuildList
          activeGuildId={activeGuildId}
          guilds={installFlowGuilds}
          newInstallDisabled={newInstallDisabled}
          onCheckInstall={async (guild) => {
            if (!guild.installSessionId) {
              return
            }

            setActiveGuildId(guild.discordGuildId)
            setNotice(null)

            try {
              const result = await completeServerInstall({
                installSessionId: guild.installSessionId,
              })

              if (result.status === "completed") {
                router.push(result.targetPath)
                return
              }

              setNotice(
                toCompleteNotice(
                  result.status,
                  "reason" in result ? result.reason : undefined
                )
              )
            } finally {
              setActiveGuildId(null)
            }
          }}
          onCreateInstall={startOrReopenInstall}
          onOpenInstalled={(guild) => {
            router.push(
              guild.dashboardHref ?? `/dashboard/${guild.discordGuildId}`
            )
          }}
          onOpenInstall={startOrReopenInstall}
          title="Servers you can add"
        />
      ) : guildResult.status === "ready" ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconServer aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No servers to add</EmptyTitle>
            <EmptyDescription>
              Discord did not return any servers where this account has Manage
              Server permission and Cleo is not already installed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {installedGuilds.length > 0 ? (
        <GuildList
          activeGuildId={activeGuildId}
          guilds={installedGuilds}
          newInstallDisabled={false}
          onCheckInstall={noopGuildAction}
          onCreateInstall={noopGuildAction}
          onOpenInstalled={(guild) => {
            router.push(
              guild.dashboardHref ?? `/dashboard/${guild.discordGuildId}`
            )
          }}
          title="Already in dashboard"
        />
      ) : null}
    </div>
  )
}

export function DiscordAddServerPageShell() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">
          Add Discord Server
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Install Cleo into a Discord server where this account has Manage
          Server permission.
        </p>
      </header>

      <AuthLoading>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconBrandDiscord aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Discord sign-in required</EmptyTitle>
            <EmptyDescription>
              Sign in to install Cleo into a Discord server.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Unauthenticated>
      <Authenticated>
        <DiscordAddServerState />
      </Authenticated>
    </main>
  )
}

function GuildAvatar({ guild }: { guild: InstallableGuild }) {
  if (guild.iconUrl) {
    return (
      <Image
        alt=""
        className="size-9 shrink-0 rounded-md object-cover"
        height={36}
        src={guild.iconUrl}
        unoptimized
        width={36}
      />
    )
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium">
      {guild.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function GuildStateBadge({ guild }: { guild: InstallableGuild }) {
  if (guild.state === "installed") {
    return <Badge variant="secondary">In dashboard</Badge>
  }

  if (guild.state === "pending") {
    if (
      guild.installSessionStatus === "bot_joined" ||
      guild.installSessionStatus === "configured"
    ) {
      return <Badge variant="outline">Finishing</Badge>
    }

    return <Badge variant="outline">Waiting for Discord</Badge>
  }

  return null
}

function GuildList({
  activeGuildId,
  guilds,
  newInstallDisabled,
  onCheckInstall,
  onCreateInstall,
  onOpenInstall,
  onOpenInstalled,
  title,
}: {
  activeGuildId: string | null
  guilds: InstallableGuild[]
  newInstallDisabled: boolean
  onCheckInstall: (guild: InstallableGuild) => Promise<void>
  onCreateInstall: (guild: InstallableGuild) => Promise<void>
  onOpenInstall?: (guild: InstallableGuild) => void
  onOpenInstalled: (guild: InstallableGuild) => void
  title: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{guilds.length}</span>
      </div>
      <div className="divide-y">
        {guilds.map((guild) => (
          <div
            className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5"
            key={guild.discordGuildId}
          >
            <div className="flex min-w-0 items-center gap-3">
              <GuildAvatar guild={guild} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{guild.name}</p>
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {guild.discordGuildId}
                  </p>
                  <GuildStateBadge guild={guild} />
                </div>
              </div>
            </div>
            <GuildAction
              activeGuildId={activeGuildId}
              guild={guild}
              newInstallDisabled={newInstallDisabled}
              onCheckInstall={() => onCheckInstall(guild)}
              onCreateInstall={() => onCreateInstall(guild)}
              onOpenInstall={
                onOpenInstall ? () => onOpenInstall(guild) : undefined
              }
              onOpenInstalled={() => onOpenInstalled(guild)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function GuildAction({
  activeGuildId,
  guild,
  newInstallDisabled,
  onCheckInstall,
  onCreateInstall,
  onOpenInstall,
  onOpenInstalled,
}: {
  activeGuildId: string | null
  guild: InstallableGuild
  newInstallDisabled: boolean
  onCheckInstall: () => Promise<void>
  onCreateInstall: () => Promise<void>
  onOpenInstall?: () => void
  onOpenInstalled: () => void
}) {
  const isActive = activeGuildId === guild.discordGuildId

  if (guild.state === "installed") {
    return (
      <Button onClick={onOpenInstalled} size="sm" variant="outline">
        <IconCircleCheck aria-hidden data-icon="inline-start" />
        Open
      </Button>
    )
  }

  if (guild.state === "pending" && guild.installSessionId) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onOpenInstall ? (
          <Button onClick={onOpenInstall} size="sm" variant="outline">
            <IconExternalLink aria-hidden data-icon="inline-start" />
            Open Discord again
          </Button>
        ) : null}

        <Button
          disabled={isActive}
          onClick={onCheckInstall}
          size="sm"
          variant="outline"
        >
          <IconClock aria-hidden data-icon="inline-start" />
          {isActive ? "Checking" : "Recheck"}
        </Button>
      </div>
    )
  }

  if (guild.state === "installable") {
    return (
      <Button
        disabled={isActive || newInstallDisabled}
        onClick={onCreateInstall}
        size="sm"
      >
        <IconExternalLink aria-hidden data-icon="inline-start" />
        {isActive ? "Starting" : "Install"}
      </Button>
    )
  }

  return (
    <Button disabled size="sm" variant="outline">
      Unavailable
    </Button>
  )
}

function toCreateNotice(
  status: string,
  reason: string | undefined
): FlowNotice {
  if (status === "missingDiscordIdentity") {
    return {
      tone: "default",
      title: "Discord account unavailable",
      description:
        "Cleo checked Clerk for this signed-in session, but Clerk did not return Discord account data for server discovery.",
    }
  }

  if (status === "configUnavailable") {
    return {
      tone: "destructive",
      title: "Discord install is not configured",
      description:
        "Cleo is missing a Discord application or client ID in the backend environment.",
    }
  }

  if (status === "forbidden") {
    return {
      tone: "default",
      title: "Server access not verified",
      description: getForbiddenReasonCopy(reason),
    }
  }

  return {
    tone: "default",
    title: "Discord guild discovery unavailable",
    description: getGuildDiscoveryReasonCopy(reason),
  }
}

function toCompleteNotice(
  status: string,
  reason: string | undefined
): FlowNotice {
  if (status === "notInstalled") {
    return {
      tone: "default",
      title: "Cleo is not installed yet",
      description:
        "Discord REST does not show Cleo in this server. Complete the Discord install prompt, then recheck.",
    }
  }

  if (status === "botVerificationUnavailable") {
    return {
      tone: "default",
      title: "Bot verification unavailable",
      description: getBotVerificationReasonCopy(reason),
    }
  }

  if (status === "userGuildDiscoveryUnavailable") {
    return {
      tone: "default",
      title: "Discord guild discovery unavailable",
      description: getGuildDiscoveryReasonCopy(reason),
    }
  }

  return {
    tone: "default",
    title: "Install session unavailable",
    description:
      "The install session is no longer active or does not belong to this Discord identity.",
  }
}

function getGuildDiscoveryUnavailableCopy(
  reason: Extract<
    InstallableGuildsResult,
    { status: "discordGuildDiscoveryUnavailable" }
  >["reason"]
) {
  switch (reason) {
    case "clerkSecretUnavailable":
      return "Server-side Clerk token resolution is not configured, so Cleo can only show servers already verified in Convex."
    case "discordAccessTokenUnavailable":
      return "Clerk did not return a Discord OAuth access token, so Cleo can only show servers already verified in Convex."
    case "discordGuildScopeUnavailable":
      return "The Discord OAuth token cannot read user guilds. Cleo can only show servers already verified in Convex."
    case "discordApiUnavailable":
      return "Discord REST guild discovery is temporarily unavailable. Cleo can still show servers already verified in Convex."
    case "discordTokenResolutionUnavailable":
      return "Cleo could not resolve the Discord OAuth token server-side, so only previously verified servers are shown."
  }
}

function getForbiddenReasonCopy(reason: string | undefined) {
  if (reason === "missingManageGuildPermission") {
    return "Discord REST shows that this identity does not currently have the required permission for that server."
  }

  return "Discord REST did not return that server for this signed-in Discord identity."
}

function getGuildDiscoveryReasonCopy(reason: string | undefined) {
  switch (reason) {
    case "clerkSecretUnavailable":
      return "Server-side Clerk token resolution is not configured."
    case "discordAccessTokenUnavailable":
      return "Clerk did not return a Discord OAuth access token for this signed-in identity."
    case "discordGuildScopeUnavailable":
      return "The Discord OAuth token cannot read user guilds."
    case "discordApiUnavailable":
      return "Discord REST guild discovery is temporarily unavailable."
    case "discordTokenResolutionUnavailable":
      return "Cleo could not resolve the Discord OAuth token server-side."
    case "discordBotTokenUnavailable":
      return "The server-side Discord bot token is not configured."
    case "discordRestDeniedAccess":
      return "Discord REST rejected the configured bot token."
    default:
      return "Discord guild discovery is unavailable."
  }
}

function getBotVerificationReasonCopy(reason: string | undefined) {
  switch (reason) {
    case "discordBotTokenUnavailable":
      return "The server-side Discord bot token is not configured."
    case "discordRestDeniedAccess":
      return "Discord REST rejected the configured bot token."
    case "discordApiUnavailable":
      return "Discord REST did not return a usable guild response for the bot token."
    default:
      return "Cleo could not verify bot access through Discord REST."
  }
}

async function noopGuildAction() {
  return undefined
}

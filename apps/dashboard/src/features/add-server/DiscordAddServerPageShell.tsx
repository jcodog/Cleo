"use client"

import { useEffect, useState } from "react"
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
  useQuery,
} from "convex/react"
import Image from "next/image"
import { useRouter } from "next/navigation"

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

function DiscordAddServerState() {
  const router = useRouter()
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
  const verifyInstalledGuild = useAction(
    api.actions.dashboard.discord.guilds.verifyInstalled.verify
  )
  const [guildResult, setGuildResult] =
    useState<InstallableGuildsResult | null>(null)
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null)
  const [notice, setNotice] = useState<FlowNotice | null>(null)
  const currentUserState =
    currentUser === undefined ? "loading" : (currentUser?._id ?? "missing")

  useEffect(() => {
    if (currentUserState === "loading") {
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
  }, [currentUserState, listInstallableGuilds])

  if (currentUser === undefined) {
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

  const guilds = guildResult.guilds

  if (guilds.length === 0) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconServer aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No manageable servers synced</EmptyTitle>
          <EmptyDescription>
            Discord did not return any servers that your signed-in identity can
            manage, and Cleo has no previously verified servers for this
            account.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

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

      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm">
          <span className="font-medium">Discord servers</span>
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
                onCheckInstall={async () => {
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
                onCreateInstall={async () => {
                  setActiveGuildId(guild.discordGuildId)
                  setNotice(null)

                  try {
                    const result = await createServerInstall({
                      discordGuildId: guild.discordGuildId,
                    })

                    if (result.status === "created") {
                      window.location.assign(result.installUrl)
                      return
                    }

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
                  } finally {
                    setActiveGuildId(null)
                  }
                }}
                onOpenInstalled={() => {
                  router.push(
                    guild.dashboardHref ?? `/dashboard/${guild.discordGuildId}`
                  )
                }}
                onVerifyInstalled={async () => {
                  setActiveGuildId(guild.discordGuildId)
                  setNotice(null)

                  try {
                    const result = await verifyInstalledGuild({
                      discordGuildId: guild.discordGuildId,
                    })

                    if (result.status === "installed") {
                      router.push(result.targetPath)
                      return
                    }

                    if (result.status === "notInstalled") {
                      const installResult = await createServerInstall({
                        discordGuildId: guild.discordGuildId,
                      })

                      if (installResult.status === "created") {
                        window.location.assign(installResult.installUrl)
                        return
                      }

                      if (installResult.status === "alreadyInstalled") {
                        router.push(installResult.targetPath)
                        return
                      }

                      setNotice(
                        toCreateNotice(
                          installResult.status,
                          "reason" in installResult
                            ? installResult.reason
                            : undefined
                        )
                      )
                      return
                    }

                    setNotice(
                      toVerifyNotice(
                        result.status,
                        "reason" in result ? result.reason : undefined
                      )
                    )
                  } finally {
                    setActiveGuildId(null)
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
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
          Install Cleo into a Discord server that your signed-in Discord
          identity can manage.
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
    return <Badge variant="secondary">Installed</Badge>
  }

  if (guild.state === "pending") {
    return <Badge variant="outline">Pending</Badge>
  }

  if (guild.state === "unavailable") {
    return <Badge variant="outline">Unavailable</Badge>
  }

  if (guild.state === "forbidden") {
    return <Badge variant="outline">No Access</Badge>
  }

  if (guild.state === "verificationNeeded") {
    return <Badge variant="outline">Verify</Badge>
  }

  return <Badge variant="outline">Installable</Badge>
}

function GuildAction({
  activeGuildId,
  guild,
  onCheckInstall,
  onCreateInstall,
  onOpenInstalled,
  onVerifyInstalled,
}: {
  activeGuildId: string | null
  guild: InstallableGuild
  onCheckInstall: () => Promise<void>
  onCreateInstall: () => Promise<void>
  onOpenInstalled: () => void
  onVerifyInstalled: () => Promise<void>
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
      <Button
        disabled={isActive}
        onClick={onCheckInstall}
        size="sm"
        variant="outline"
      >
        <IconClock aria-hidden data-icon="inline-start" />
        {isActive ? "Checking" : "Check sync"}
      </Button>
    )
  }

  if (guild.state === "installable") {
    return (
      <Button disabled={isActive} onClick={onCreateInstall} size="sm">
        <IconExternalLink aria-hidden data-icon="inline-start" />
        {isActive ? "Starting" : "Add Cleo"}
      </Button>
    )
  }

  if (guild.state === "verificationNeeded") {
    return (
      <Button
        disabled={isActive}
        onClick={onVerifyInstalled}
        size="sm"
        variant="outline"
      >
        <IconCircleCheck aria-hidden data-icon="inline-start" />
        {isActive ? "Verifying" : "Verify"}
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

function toVerifyNotice(
  status: string,
  reason: string | undefined
): FlowNotice {
  if (status === "forbidden") {
    return {
      tone: "default",
      title: "Server access not verified",
      description: getForbiddenReasonCopy(reason),
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
    title: "Discord account unavailable",
    description:
      "Cleo checked Clerk for this signed-in session, but Clerk did not return Discord account data for server discovery.",
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
    return "Discord REST shows that this identity does not currently have Administrator or Manage Server permission for that server."
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

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  IconAlertCircle,
  IconBrandDiscord,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconPlus,
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
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { useAction, useQuery } from "convex/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"

type ManageableGuild = {
  guildId: Id<"guilds">
  discordGuildId: string
  name: string
  iconUrl?: string
  memberCount?: number
  presenceCount?: number
  botJoinedAt?: number
  botInstallationVerifiedAt?: number
  lastOpenedAt?: number
  lastSyncedAt?: number
}

type InstallableGuild = {
  discordGuildId: string
  name: string
  iconUrl?: string
  memberCount?: number
  presenceCount?: number
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

const EMPTY_MANAGEABLE_GUILDS: ManageableGuild[] = []
const EMPTY_INSTALLABLE_GUILDS: InstallableGuild[] = []

export function DiscordDashboardPageShell() {
  const router = useRouter()
  const currentUser = useQuery(api.queries.dashboard.account.currentUser.get)
  const manageableGuilds = useQuery(
    api.queries.dashboard.discord.guilds.manageable.list
  )
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
  const [discoveryError, setDiscoveryError] = useState(false)
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
          setDiscoveryError(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiscoveryError(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentUserState, listInstallableGuilds])

  const isLoading =
    currentUser === undefined || manageableGuilds === undefined
  const installedGuilds = useMemo(
    () => {
      const guildsByDiscordId = new Map<
        string,
        ManageableGuild | InstallableGuild
      >()

      for (const guild of manageableGuilds ?? EMPTY_MANAGEABLE_GUILDS) {
        if (isGuildInstalled(guild)) {
          guildsByDiscordId.set(guild.discordGuildId, guild)
        }
      }

      if (guildResult?.status === "ready") {
        for (const guild of guildResult.guilds) {
          if (guild.state === "installed") {
            guildsByDiscordId.set(guild.discordGuildId, guild)
          }
        }
      }

      return Array.from(guildsByDiscordId.values()).sort((left, right) =>
        left.name.localeCompare(right.name)
      )
    },
    [guildResult, manageableGuilds]
  )
  const discoveryGuilds = useMemo(
    () =>
      guildResult?.status === "ready"
        ? guildResult.guilds
        : EMPTY_INSTALLABLE_GUILDS,
    [guildResult]
  )
  const allDiscoveryGuilds = useMemo(
    () =>
      guildResult?.status === "ready" ||
      guildResult?.status === "discordGuildDiscoveryUnavailable"
        ? guildResult.guilds
        : EMPTY_INSTALLABLE_GUILDS,
    [guildResult]
  )
  const unavailableGuilds = useMemo(
    () =>
      allDiscoveryGuilds.filter(
        (guild) => guild.state === "unavailable" || guild.state === "forbidden"
      ),
    [allDiscoveryGuilds]
  )
  const pendingGuilds = useMemo(
    () =>
      (guildResult?.status === "ready" ||
      guildResult?.status === "discordGuildDiscoveryUnavailable"
        ? guildResult.guilds
        : []
      ).filter((guild) => guild.state === "pending"),
    [guildResult]
  )
  const installableGuilds = useMemo(
    () => discoveryGuilds.filter((guild) => guild.state === "installable"),
    [discoveryGuilds]
  )
  const verificationGuilds = useMemo(
    () =>
      discoveryGuilds.filter((guild) => guild.state === "verificationNeeded"),
    [discoveryGuilds]
  )
  const recentlyOpenedGuilds = useMemo(
    () =>
      installedGuilds
        .filter(
          (guild): guild is ManageableGuild =>
            "lastOpenedAt" in guild && guild.lastOpenedAt !== undefined
        )
        .slice(0, 5),
    [installedGuilds]
  )

  async function handleCreateInstall(guild: InstallableGuild) {
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
        toCreateNotice(result.status, "reason" in result ? result.reason : undefined)
      )
    } catch (error) {
      setNotice(toUnexpectedNotice(error))
    } finally {
      setActiveGuildId(null)
    }
  }

  async function handleCompleteInstall(guild: InstallableGuild) {
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
    } catch (error) {
      setNotice(toUnexpectedNotice(error))
    } finally {
      setActiveGuildId(null)
    }
  }

  async function handleVerifyInstalled(guild: InstallableGuild) {
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
        await handleCreateInstall(guild)
        return
      }

      setNotice(
        toVerifyNotice(result.status, "reason" in result ? result.reason : undefined)
      )
    } catch (error) {
      setNotice(toUnexpectedNotice(error))
    } finally {
      setActiveGuildId(null)
    }
  }

  if (isLoading) {
    return (
      <DashboardFrame>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </DashboardFrame>
    )
  }

  return (
    <DashboardFrame>
      <div className="flex flex-col gap-4">
        {discoveryError ? (
          <Alert variant="destructive">
            <IconAlertCircle aria-hidden />
            <AlertTitle>Discord discovery unavailable</AlertTitle>
            <AlertDescription>
              Cleo could not check live Discord server discovery. Previously
              verified servers are still shown below.
            </AlertDescription>
          </Alert>
        ) : null}

        {guildResult?.status === "discordGuildDiscoveryUnavailable" ? (
          <Alert>
            <IconAlertCircle aria-hidden />
            <AlertTitle>Live Discord discovery unavailable</AlertTitle>
            <AlertDescription>
              {getGuildDiscoveryUnavailableCopy(guildResult.reason)}
            </AlertDescription>
          </Alert>
        ) : null}

        {guildResult?.status === "missingDiscordIdentity" ? (
          <Alert>
            <IconBrandDiscord aria-hidden />
            <AlertTitle>Discord account unavailable</AlertTitle>
            <AlertDescription>
              Cleo checked Clerk for this signed-in session, but Clerk did not
              return Discord account data for server discovery.
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-4">
            <GuildListCard
              description="Servers where this Discord identity has verified dashboard access."
              emptyDescription="No installed Discord servers are verified for this account yet."
              emptyTitle="No installed servers"
              guilds={installedGuilds}
              title="Installed Servers"
            />

            <InstallableGuildList
              activeGuildId={activeGuildId}
              description="Manageable Discord servers that need one explicit REST check before Cleo can open them."
              emptyDescription="No discovered servers need installed-state verification."
              guilds={verificationGuilds}
              onCreateInstall={handleCreateInstall}
              onRecheckInstall={handleCompleteInstall}
              onVerifyInstalled={handleVerifyInstalled}
              title="Needs Verification"
            />

            <InstallableGuildList
              activeGuildId={activeGuildId}
              description="Servers that can start the Discord install flow now."
              emptyDescription="No additional installable servers were returned by Discord REST."
              guilds={installableGuilds}
              onCreateInstall={handleCreateInstall}
              onRecheckInstall={handleCompleteInstall}
              onVerifyInstalled={handleVerifyInstalled}
              title="Available to Install"
            />
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Next Action</CardTitle>
                <CardDescription>
                  Add Cleo to a server your Discord identity can manage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "w-full justify-start"
                  )}
                  href="/dashboard/add-server"
                >
                  <IconPlus aria-hidden data-icon="inline-start" />
                  Add Discord Server
                </Link>
              </CardContent>
            </Card>

            <InstallableGuildList
              activeGuildId={activeGuildId}
              description="Install sessions waiting for a manual REST recheck."
              emptyDescription="No active install sessions."
              guilds={pendingGuilds}
              onCreateInstall={handleCreateInstall}
              onRecheckInstall={handleCompleteInstall}
              onVerifyInstalled={handleVerifyInstalled}
              title="Pending Installs"
            />

            <GuildListCard
              description="Recently opened verified servers."
              emptyDescription="Open a server workspace and it will appear here."
              emptyTitle="No recent servers"
              guilds={recentlyOpenedGuilds}
              title="Recently Opened"
            />

            {unavailableGuilds.length > 0 ? (
              <UnavailableGuilds guilds={unavailableGuilds} />
            ) : null}
          </div>
        </div>
      </div>
    </DashboardFrame>
  )
}

function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium">
            Discord Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage installed Discord servers and continue active install flows.
          </p>
        </div>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/dashboard/add-server"
        >
          <IconPlus aria-hidden data-icon="inline-start" />
          Add Server
        </Link>
      </header>
      {children}
    </main>
  )
}

function GuildListCard({
  description,
  emptyDescription,
  emptyTitle,
  guilds,
  title,
}: {
  description: string
  emptyDescription: string
  emptyTitle: string
  guilds: Array<ManageableGuild | InstallableGuild>
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline">{guilds.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {guilds.length > 0 ? (
          <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
            {guilds.map((guild, index) => (
              <ServerRow
                href={`/dashboard/${guild.discordGuildId}`}
                isLast={index === guilds.length - 1}
                key={guild.discordGuildId}
                guild={guild}
                status="Installed"
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-56 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconServer aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

function InstallableGuildList({
  activeGuildId,
  description,
  emptyDescription,
  guilds,
  onCreateInstall,
  onRecheckInstall,
  onVerifyInstalled,
  title,
}: {
  activeGuildId: string | null
  description: string
  emptyDescription: string
  guilds: InstallableGuild[]
  onCreateInstall: (guild: InstallableGuild) => Promise<void>
  onRecheckInstall: (guild: InstallableGuild) => Promise<void>
  onVerifyInstalled: (guild: InstallableGuild) => Promise<void>
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline">{guilds.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {guilds.length > 0 ? (
          <div className="flex flex-col gap-0 overflow-hidden rounded-lg border">
            {guilds.map((guild, index) => (
              <InstallableServerRow
                activeGuildId={activeGuildId}
                isLast={index === guilds.length - 1}
                key={guild.discordGuildId}
                guild={guild}
                onCreateInstall={onCreateInstall}
                onRecheckInstall={onRecheckInstall}
                onVerifyInstalled={onVerifyInstalled}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyDescription}</p>
        )}
      </CardContent>
    </Card>
  )
}

function InstallableServerRow({
  activeGuildId,
  guild,
  isLast,
  onCreateInstall,
  onRecheckInstall,
  onVerifyInstalled,
}: {
  activeGuildId: string | null
  guild: InstallableGuild
  isLast: boolean
  onCreateInstall: (guild: InstallableGuild) => Promise<void>
  onRecheckInstall: (guild: InstallableGuild) => Promise<void>
  onVerifyInstalled: (guild: InstallableGuild) => Promise<void>
}) {
  const isActive = activeGuildId === guild.discordGuildId

  return (
    <div
      className={
        isLast
          ? "flex min-w-0 items-center justify-between gap-3 p-3"
          : "flex min-w-0 items-center justify-between gap-3 border-b p-3"
      }
    >
      <ServerIdentity guild={guild} />
      <div className="flex shrink-0 items-center gap-2">
        <GuildStateBadge guild={guild} />
        <GuildActionButton
          guild={guild}
          isActive={isActive}
          onCreateInstall={onCreateInstall}
          onRecheckInstall={onRecheckInstall}
          onVerifyInstalled={onVerifyInstalled}
        />
      </div>
    </div>
  )
}

function GuildActionButton({
  guild,
  isActive,
  onCreateInstall,
  onRecheckInstall,
  onVerifyInstalled,
}: {
  guild: InstallableGuild
  isActive: boolean
  onCreateInstall: (guild: InstallableGuild) => Promise<void>
  onRecheckInstall: (guild: InstallableGuild) => Promise<void>
  onVerifyInstalled: (guild: InstallableGuild) => Promise<void>
}) {
  if (guild.state === "pending" && guild.installSessionId) {
    return (
      <Button
        disabled={isActive}
        onClick={() => void onRecheckInstall(guild)}
        size="sm"
        variant="outline"
      >
        <IconClock aria-hidden data-icon="inline-start" />
        {isActive ? "Checking" : "Recheck"}
      </Button>
    )
  }

  if (guild.state === "verificationNeeded") {
    return (
      <Button
        disabled={isActive}
        onClick={() => void onVerifyInstalled(guild)}
        size="sm"
        variant="outline"
      >
        <IconCircleCheck aria-hidden data-icon="inline-start" />
        {isActive ? "Verifying" : "Verify"}
      </Button>
    )
  }

  if (guild.state === "installable") {
    return (
      <Button
        disabled={isActive}
        onClick={() => void onCreateInstall(guild)}
        size="sm"
      >
        <IconExternalLink aria-hidden data-icon="inline-start" />
        {isActive ? "Starting" : "Add"}
      </Button>
    )
  }

  return (
    <Button disabled size="sm" variant="outline">
      Unavailable
    </Button>
  )
}

function UnavailableGuilds({ guilds }: { guilds: InstallableGuild[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unavailable Servers</CardTitle>
        <CardDescription>
          Servers returned by Discord that Cleo cannot open or install from the
          current verified state.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {guilds.slice(0, 5).map((guild) => (
          <div
            className="flex min-w-0 items-center justify-between gap-3 text-sm"
            key={guild.discordGuildId}
          >
            <span className="truncate font-medium">{guild.name}</span>
            <Badge variant="outline">
              {getUnavailableReason(guild.unavailableReason)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ServerRow({
  guild,
  href,
  isLast,
  status,
}: {
  guild: ManageableGuild | InstallableGuild
  href: string
  isLast: boolean
  status: string
}) {
  return (
    <Link
      className={
        isLast
          ? "flex min-w-0 items-center justify-between gap-3 p-3 hover:bg-muted/50"
          : "flex min-w-0 items-center justify-between gap-3 border-b p-3 hover:bg-muted/50"
      }
      href={href}
    >
      <ServerIdentity guild={guild} />
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={status === "Installed" ? "secondary" : "outline"}>
          {status}
        </Badge>
        {status === "Pending" ? (
          <IconClock aria-hidden className="text-muted-foreground" />
        ) : status === "Installed" ? (
          <IconCircleCheck aria-hidden className="text-muted-foreground" />
        ) : (
          <IconExternalLink aria-hidden className="text-muted-foreground" />
        )}
      </div>
    </Link>
  )
}

function ServerIdentity({
  guild,
}: {
  guild: ManageableGuild | InstallableGuild
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <GuildAvatar guild={guild} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{guild.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {guild.discordGuildId}
        </p>
      </div>
    </div>
  )
}

function GuildStateBadge({ guild }: { guild: InstallableGuild }) {
  switch (guild.state) {
    case "pending":
      return <Badge variant="outline">Pending</Badge>
    case "verificationNeeded":
      return <Badge variant="outline">Verify</Badge>
    case "installable":
      return <Badge variant="outline">Installable</Badge>
    case "installed":
      return <Badge variant="secondary">Installed</Badge>
    case "forbidden":
      return <Badge variant="outline">No Access</Badge>
    case "unavailable":
      return <Badge variant="outline">Unavailable</Badge>
  }
}

function GuildAvatar({
  guild,
}: {
  guild: Pick<ManageableGuild | InstallableGuild, "iconUrl" | "name">
}) {
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

function getUnavailableReason(reason: InstallableGuild["unavailableReason"]) {
  switch (reason) {
    case "missingManageGuildPermission":
      return "No manage access"
    case "botLeft":
      return "Bot left"
    case "botSyncUnavailable":
      return "Sync pending"
    case "verificationUnavailable":
      return "Not verified"
    default:
      return "Unavailable"
  }
}

function isGuildInstalled(guild: ManageableGuild) {
  return (
    guild.botJoinedAt !== undefined ||
    guild.botInstallationVerifiedAt !== undefined
  )
}

function toCreateNotice(
  status: string,
  reason: string | undefined
): FlowNotice {
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

  if (status === "verificationUnavailable") {
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

function toUnexpectedNotice(error: unknown): FlowNotice {
  return {
    tone: "destructive",
    title: "Discord REST action failed",
    description:
      error instanceof Error && error.message
        ? error.message
        : "Refresh and try again.",
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

"use client"

import { IconBrandDiscord, IconClock, IconServer } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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
  useQuery,
} from "convex/react"

function DiscordAddServerState() {
  const currentUser = useQuery(api.queries.dashboard.account.currentUser.get)
  const discordIdentity = useQuery(
    api.queries.dashboard.account.discordIdentity.get
  )
  const manageableGuilds = useQuery(
    api.queries.dashboard.discord.guilds.manageable.list
  )

  if (
    currentUser === undefined ||
    discordIdentity === undefined ||
    manageableGuilds === undefined
  ) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!currentUser || !discordIdentity) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconBrandDiscord aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Discord identity syncing</EmptyTitle>
          <EmptyDescription>
            Your signed-in Discord identity has not reached the dashboard
            backend yet. Refresh shortly, then try adding a server again.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (manageableGuilds.length === 0) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconServer aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No manageable servers synced</EmptyTitle>
          <EmptyDescription>
            Cleo has not synced any Discord servers that your Discord identity
            can manage. The OAuth install flow will be added in a later pass.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <IconClock aria-hidden />
        <AlertTitle>Install action pending</AlertTitle>
        <AlertDescription>
          These servers are already known to the backend. Starting a new Discord
          install from this page will be wired once the Discord OAuth actions
          are implemented.
        </AlertDescription>
      </Alert>

      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm">
          <span className="font-medium">Manageable servers</span>
          <span className="text-muted-foreground">
            {manageableGuilds.length}
          </span>
        </div>
        <div className="divide-y">
          {manageableGuilds.map((guild) => (
            <div
              className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
              key={guild.discordGuildId}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{guild.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {guild.discordGuildId}
                </p>
              </div>
              <Button disabled size="sm" variant="outline">
                <IconClock aria-hidden data-icon="inline-start" />
                Pending
              </Button>
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
          Review the current Discord identity state before starting a server
          install. Discord OAuth install actions are not implemented in this
          pass.
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

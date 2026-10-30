"use client"

import { useAuth, useReverification, useUser } from "@clerk/nextjs"
import { useAction, useQuery } from "convex/react"
import { useState } from "react"
import Link from "next/link"
import { IconBrandDiscord, IconBrandTwitch } from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { LinkedRolesDialog } from "@/features/community/LinkedRolesDialog"
import { beginTwitchLink, getTwitchLinkState } from "@/features/twitch/linking"

export function AccountConnections() {
  const { userId, isLoaded, sessionId } = useAuth()
  if (!isLoaded || !userId)
    return <p role="status">Loading connected accounts…</p>
  return <Connections key={`${userId}:${sessionId}`} />
}

function Connections() {
  const { user } = useUser()
  const { userId } = useAuth()
  const linkedRoles = useQuery(api.discordConnections.status, {})
  const disconnectRoles = useAction(api.communityActions.disconnectLinkedRoles)
  const syncAccounts = useAction(
    api.actions.dashboard.account.syncLinkedAccounts.sync
  )
  const syncGuilds = useAction(
    api.actions.dashboard.discord.guilds.syncDashboardGuilds.sync
  )
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [confirmation, setConfirmation] = useState<"twitch" | "roles" | null>(
    null
  )
  const accounts = user?.externalAccounts ?? []
  const discord = accounts.find((account) => account.provider === "discord")
  const twitch = accounts.find((account) => account.provider === "twitch")
  const canDisconnectTwitch =
    !!twitch && discord?.verification?.status === "verified"
  const connect = useReverification(async (provider: "discord" | "twitch") => {
    if (!user) throw new Error("Account unavailable")
    if (provider === "twitch")
      return beginTwitchLink(
        user,
        window.location.origin,
        [],
        [],
        "/account/connections"
      )
    const matching = user.externalAccounts.filter(
      (account) => account.provider === "discord"
    )
    if (matching.length > 1) throw new Error("Ambiguous Discord connection")
    const params = {
      redirectUrl: `${window.location.origin}/account/connections`,
      additionalScopes: [
        ...new Set([
          "identify",
          "guilds",
          ...(matching[0]?.approvedScopes.split(/\s+/).filter(Boolean) ?? []),
        ]),
      ],
    }
    const result = matching[0]
      ? await matching[0].reauthorize(params)
      : await user.createExternalAccount({
          ...params,
          strategy: "oauth_discord",
        })
    const url = result.verification?.externalVerificationRedirectURL
    if (!url || url.protocol !== "https:")
      throw new Error("Secure authorisation unavailable")
    return url.href
  })
  const removeTwitch = useReverification(async () => {
    if (!user) throw new Error("Account unavailable")
    const fresh = await user.reload()
    if (
      !fresh.externalAccounts.some(
        (account) =>
          account.provider === "discord" &&
          account.verification?.status === "verified"
      )
    )
      throw new Error("Keep a verified sign-in identity")
    const matches = fresh.externalAccounts.filter(
      (account) => account.provider === "twitch"
    )
    if (matches.length !== 1 || !matches[0])
      throw new Error("Connection changed")
    await matches[0].destroy()
    await user.reload()
    await syncAccounts({})
  })
  async function run(operation: () => Promise<void>, success: string) {
    if (busy) return
    setBusy(true)
    setNotice("")
    try {
      await operation()
      setNotice(success)
    } catch {
      setNotice(
        "The connection could not be updated. Check your sign-in session and try again."
      )
    } finally {
      setBusy(false)
    }
  }
  if (!user || user.id !== userId)
    return <p role="status">Loading connected accounts…</p>
  return (
    <section className="mx-auto w-full max-w-4xl space-y-7">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-medium">
          Connected accounts
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Manage the application permissions Cleo uses for community features.
          Sign-in identities and security are managed in Clerk’s Account
          section.
        </p>
      </header>
      <div className="divide-y border-y">
        <section
          className="space-y-4 py-6"
          aria-labelledby="discord-connection"
        >
          <div className="flex items-start gap-3">
            <IconBrandDiscord className="mt-1 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-1">
              <h2 id="discord-connection" className="font-medium">
                Discord
              </h2>
              <p className="text-sm break-words">
                {discord
                  ? discord.username ||
                    discord.emailAddress ||
                    discord.providerUserId
                  : "Not connected"}
              </p>
              <p className="text-sm text-muted-foreground">
                {discord?.verification?.status === "verified"
                  ? "Discord identity available for community authorisation"
                  : discord
                    ? "Verify this identity in Account before authorising community access"
                    : "Your primary identity for Discord communities."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy || !user}
              onClick={() =>
                run(async () => {
                  window.location.assign(await connect("discord"))
                }, "")
              }
            >
              {discord ? "Reauthorise Discord" : "Connect Discord"}
            </Button>
            {discord ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await syncGuilds({})
                    if (
                      result.status !== "ready" &&
                      result.status !== "verificationPending"
                    )
                      throw new Error("Server verification is unavailable")
                  }, "Server verification requested. Open your servers to check progress.")
                }
              >
                Refresh server access
              </Button>
            ) : null}
            <Link
              href="/dashboard/servers"
              className="self-center text-sm underline underline-offset-4"
            >
              View servers
            </Link>
          </div>
        </section>
        <section className="space-y-4 py-6" aria-labelledby="twitch-connection">
          <div className="flex items-start gap-3">
            <IconBrandTwitch className="mt-1 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-1">
              <h2 id="twitch-connection" className="font-medium">
                Twitch
              </h2>
              <p className="text-sm break-words">
                {twitch
                  ? twitch.username ||
                    twitch.emailAddress ||
                    twitch.providerUserId
                  : "Not connected"}
              </p>
              <p className="text-sm text-muted-foreground">
                {twitch
                  ? getTwitchLinkState(accounts) === "connected"
                    ? "Connected with broadcaster permissions"
                    : "Additional broadcaster permission or reauthorisation is required"
                  : "Connect your broadcaster identity for Cleo's Twitch tools."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy || !user}
              onClick={() =>
                run(async () => {
                  window.location.assign(await connect("twitch"))
                }, "")
              }
            >
              {twitch ? "Reauthorise Twitch" : "Connect Twitch"}
            </Button>
            {canDisconnectTwitch ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setNotice("")
                  setConfirmation("twitch")
                }}
              >
                Disconnect Twitch
              </Button>
            ) : null}
          </div>
          {twitch && !canDisconnectTwitch ? (
            <p className="text-xs text-muted-foreground">
              Keep a verified Discord sign-in connected before removing Twitch.
            </p>
          ) : null}
        </section>
        <section className="space-y-4 py-6" aria-labelledby="roles-connection">
          <div className="space-y-2">
            <h2 id="roles-connection" className="font-medium">
              Discord Linked Roles consent
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {linkedRoles === undefined
                ? "Checking application consent…"
                : linkedRoles
                  ? linkedRoles.metadataPublished
                    ? "Cleo has published your Linked Roles metadata to Discord."
                    : "Application consent is connected. Metadata publication is pending."
                  : "No active Linked Roles consent is recorded. Claim roles inside Discord when you choose to use them."}{" "}
              Your Discord sign-in and server permissions are separate.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkedRolesDialog variant="button" />
            {linkedRoles ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setNotice("")
                  setConfirmation("roles")
                }}
              >
                Disconnect Linked Roles consent
              </Button>
            ) : null}
          </div>
        </section>
      </div>
      {notice && confirmation === null ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation === "twitch"
                ? "Disconnect Twitch?"
                : "Disconnect Linked Roles consent?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation === "twitch"
                ? "Cleo's Twitch features will lose this connection. Your verified Discord sign-in will remain available."
                : "This removes Linked Roles verification consent. Your Discord sign-in remains connected."}
            </DialogDescription>
          </DialogHeader>
          {notice ? (
            <p role="alert" className="text-sm">
              {notice}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (confirmation === "twitch") await removeTwitch()
                  else await disconnectRoles({})
                  setConfirmation(null)
                }, "Connection removed.")
              }
            >
              Confirm disconnect
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

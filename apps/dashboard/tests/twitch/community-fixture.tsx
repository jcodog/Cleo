import React, { StrictMode, useState, useSyncExternalStore } from "react"
import { resolveCleoRoleEligibility } from "@workspace/shared/cleoRoleEligibility"
import { AccountRoles } from "../../src/features/community/AccountRoles"
import { LinkedRoleCallback } from "../../src/features/community/LinkedRoleCallback"
import { PremiumPurchases } from "../../src/features/community/PremiumPurchases"
import { DiscordAddServerPageShell } from "../../src/features/add-server/DiscordAddServerPageShell"
import { LinkedRoleTesting } from "../../src/features/staff/LinkedRoleTesting"
import { DashboardDiscordHydrator } from "../../src/features/app-shell/DashboardDiscordHydrator"

const params = new URLSearchParams(location.search)
export const communityFixtureMode = params.has("community")
const calls: { path: string; args: unknown }[] = []
const observers = new Set<() => void>()
let discoveryRequests = 0
const verifiedAt = Date.now()
let progress: {
  state: "pending" | "complete"
  ticket: { id: string; revision: number }
  observedAt: number
} | null = null
const discordIdentity = { providerAccountId: "111111111111111111" }
let testGrant: { roles: string[]; expiresAt: number; reason: string } | null =
  null
let purchaseView = {
  configured: true,
  canManageOwnBilling: true,
  communityPublishIdentity: false,
  subscriptions: params.has("existing")
    ? [
        {
          id: "paid-fixture",
          announce: false,
          displayRole: false,
          active: true,
          testMode: false,
        },
      ]
    : [],
}
export function communityQuery(path: string) {
  if (path === "queries/dashboard/account/discordIdentity:get")
    return discordIdentity
  if (path === "communityRoles:refreshProgress") return progress
  if (path === "queries/dashboard/account/currentUser:get")
    return { _id: "fixture-user", clerkUserId: "fixture-clerk" }
  if (path === "communityRoleTesting:access") return !params.has("nonAdmin")
  if (path === "communityRoleTesting:users")
    return {
      page: [{ id: "fixture-user", name: "Jason", disabled: false }],
      continueCursor: "",
      isDone: true,
    }
  if (path === "communityRoleTesting:current") return testGrant
  if (path === "premiumPurchases:view") return purchaseView
  if (path === "communityRoles:current")
    return resolveCleoRoleEligibility({
      now: Date.now(),
      verifiedAccount: true,
      communities: [],
      twitchActive: false,
      paidSupporter: false,
    })
  throw new Error(`Unexpected community query ${path}`)
}
export async function communityWrite(
  path: string,
  args: unknown,
  notify: () => void
) {
  calls.push({ path, args })
  observers.forEach((callback) => callback())
  if (path === "actions/dashboard/account/syncLinkedAccounts:sync")
    return { status: "ready" }
  if (path === "actions/dashboard/discord/guilds/syncDashboardGuilds:sync") {
    discoveryRequests++
    if (!progress || discoveryRequests === 3)
      progress = {
        state: discoveryRequests < 3 ? "pending" : "complete",
        ticket: { id: "fixture-refresh", revision: 1 },
        observedAt: verifiedAt,
      }
    notify()
    return discoveryRequests < 3
      ? { status: "verificationPending", guilds: [] }
      : { status: "ready", verifiedAt, guilds: [] }
  }
  if (path === "communityActions:beginLinkedRoles")
    return "https://discord.com/oauth2/authorize?client_id=fixture&state=fixture-state"
  if (path === "communityActions:installAccount")
    return "https://discord.com/oauth2/authorize?integration_type=1&scope=applications.commands"
  if (path === "actions/dashboard/discord/install/listInstallableGuilds:list") {
    discoveryRequests++
    if (params.has("discoveryFailure")) throw new Error("Provider unavailable")
    if (discoveryRequests <= 2 || params.has("discoveryPending"))
      return { status: "verificationPending", guilds: [] }
    return {
      status: "ready",
      verifiedAt: Date.now(),
      guilds: [
        {
          discordGuildId: "333333333333333333",
          name: "Installed community",
          state: "installed",
          dashboardHref: "/dashboard/333333333333333333",
        },
        {
          discordGuildId: "444444444444444444",
          name: "Available community",
          state: "installable",
        },
      ],
    }
  }
  if (path === "communityRoleTesting:set") {
    const input = args as { roles: string[]; hours: number; reason: string }
    testGrant = input.roles.length
      ? {
          roles: input.roles,
          expiresAt: Date.now() + input.hours * 3600000,
          reason: input.reason,
        }
      : null
    notify()
    return null
  }
  if (path === "communityActions:finishLinkedRoles") {
    if (params.has("wrongAccount"))
      throw new Error("Wrong linked Discord identity")
    return null
  }
  if (path === "premiumPurchases:preferences") {
    if (params.has("failPreferences")) throw new Error("Preference save failed")
    const input = args as {
      activationId: string
      announce: boolean
      displayRole: boolean
    }
    purchaseView = {
      ...purchaseView,
      subscriptions: purchaseView.subscriptions.map((p) =>
        p.id === input.activationId
          ? { ...p, announce: input.announce, displayRole: input.displayRole }
          : p
      ),
    }
  } else if (path === "premiumActions:setCommunityConsent") {
    if (params.has("failConsent"))
      throw new Error("Community consent save failed")
    purchaseView = {
      ...purchaseView,
      communityPublishIdentity: (args as { publishIdentity: boolean })
        .publishIdentity,
    }
  } else if (path !== "premiumActions:checkout")
    throw new Error(`Unexpected community operation ${path}`)
  notify()
  observers.forEach((callback) => callback())
  return null
}
export function CommunityFixture() {
  const [revision, setRevision] = useState(0)
  const operations = useSyncExternalStore(
    (callback) => {
      observers.add(callback)
      return () => {
        observers.delete(callback)
      }
    },
    () => JSON.stringify(calls)
  )
  return (
    <main>
      <StrictMode>
        {params.has("hydration") ? (
          <DashboardDiscordHydrator />
        ) : params.has("discovery") ? (
          <DiscordAddServerPageShell />
        ) : params.has("adminRoles") ? (
          <LinkedRoleTesting />
        ) : location.pathname === "/discord/linked-role" ? (
          <LinkedRoleCallback
            code={params.get("code") ?? undefined}
            state={params.get("state") ?? undefined}
            error={params.get("error") ?? undefined}
          />
        ) : (
          <AccountRoles />
        )}
        {location.pathname === "/account/billing" ? (
          <PremiumPurchases discordGuildId="333333333333333333" />
        ) : null}
      </StrictMode>
      <button onClick={() => setRevision((value) => value + 1)}>
        Rerender fixture {revision}
      </button>
      <output hidden data-testid="community-calls">
        {operations}
      </output>
      <output hidden data-testid="community-view">
        {JSON.stringify(purchaseView)}
      </output>
    </main>
  )
}

import React, {
  StrictMode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react"
import { resolveCleoRoleEligibility } from "@workspace/shared/cleoRoleEligibility"
import { AccountRoles } from "../../src/features/community/AccountRoles"
import { LinkedRoleCallback } from "../../src/features/community/LinkedRoleCallback"
import { PremiumPurchases } from "../../src/features/community/PremiumPurchases"
import { CheckoutReturn } from "../../src/features/community/PremiumCheckout"
import { DiscordAddServerPageShell } from "../../src/features/add-server/DiscordAddServerPageShell"
import { LinkedRoleTesting } from "../../src/features/staff/LinkedRoleTesting"
import { DashboardDiscordHydrator } from "../../src/features/app-shell/DashboardDiscordHydrator"
import { DashboardShellClient } from "../../src/features/app-shell/DashboardShellClient"
import { DashboardEntry } from "../../src/features/dashboard/DashboardEntry"
import { SessionRecovery } from "../../src/features/auth/SessionRecovery"
import { useAppShellStore } from "../../src/components/stores/app-shell-store"
import { DiscordDashboardPageShell } from "../../src/features/dashboard/DiscordDashboardPageShell"
import { SettingsSection } from "../../src/features/discord-guild-workspace/sections/SettingsSection"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { usePathname } from "./navigation-fixture"
import { preloadQuery } from "convex/nextjs"
import type { Preloaded } from "convex/react"

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
const directoryGuilds = [
  {
    discordGuildId: "333333333333333333",
    name: "Cleo community",
    verified: true,
    verifiedAt,
    memberCount: 240,
    lastOpenedAt: 100,
  },
  {
    discordGuildId: "444444444444444444",
    name: "Second server",
    verified: true,
    verifiedAt,
    memberCount: 72,
    lastOpenedAt: 200,
  },
]
let directory = {
  clerkUserId: "fixture-clerk" as string | null,
  status: "ready",
  guilds: directoryGuilds,
}
if (params.has("savedServer"))
  useAppShellStore.setState({
    selectionClerkUserId: "fixture-clerk",
    selectedDiscordGuildId: params.get("savedServer") ?? undefined,
  })
if (params.has("emptyDirectory")) directory.guilds = []
if (params.has("pendingDirectory")) directory.status = "pending"
window.addEventListener("directory-fixture", (event) => {
  if (!(event instanceof CustomEvent)) return
  directory = {
    clerkUserId: event.detail.unavailableAccount ? null : "fixture-clerk",
    status: event.detail.status,
    guilds: event.detail.removed ? directoryGuilds.slice(1) : directoryGuilds,
  }
  window.dispatchEvent(new Event("fixture-update"))
})
let testGrant: { roles: string[]; expiresAt: number; reason: string } | null =
  null
let purchaseView = {
  pendingCheckout: params.has("pendingCheckout")
    ? { sessionId: "cs_test_fixture", announce: true, displayRole: false }
    : null,
  configured: true,
  canManageOwnBilling: true,
  communityPublishIdentity: false,
  guildPremium: {
    state: "expired",
    capabilities: [],
    validUntil: 0,
    canPurchase: true,
  },
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
  if (path === "discordConnections:status") return null
  if (path === "queries/dashboard/discord/guilds/directory:list")
    return directory
  if (path === "queries/dashboard/discord/guilds/manageable:list")
    return directory.status === "ready" ? directory.guilds : []
  if (path === "queries/dashboard/staff/access:get") return null
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
  if (path === "communityActions:connectClerkLinkedRoles")
    return params.has("consented")
      ? "ready"
      : params.has("appMismatch")
        ? "applicationMismatch"
        : "consentRequired"
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
  } else if (path === "premiumActions:checkout") {
    return {
      sessionId: "cs_test_fixture",
      clientSecret: "cs_test_fixture_secret_fixture",
      expiresAt: params.has("expiredCheckout")
        ? Date.now() - 1
        : Date.now() + 1800000,
      offer: {
        name: "Cleo Server Premium",
        guildName: "Premium Guild",
        email: "alice@example.com",
        unitAmount: 499,
        currency: "gbp",
        interval: "month",
        intervalCount: 1,
      },
    }
  } else if (path === "premiumActions:checkoutStatus") {
    if (params.has("statusError")) throw new Error("Status unavailable")
    return {
      status: params.has("expiredCheckout") ? "expired" : "complete",
      paymentStatus: params.has("asyncPayment") ? "unpaid" : "paid",
      guildName: "Premium Guild",
    }
  } else if (path === "premiumActions:cancelCheckout") {
    if (params.has("cancelError")) throw new Error("Expiration uncertain")
    if (params.has("completeRace")) return "complete"
    purchaseView = { ...purchaseView, pendingCheckout: null }
    notify()
    return "expired"
  } else throw new Error(`Unexpected community operation ${path}`)
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
  if (params.has("sessionRecovery"))
    return <SessionRecovery returnTo="/dashboard/333333333333333333/welcome" />
  if (params.has("navigation"))
    return (
      <>
        <NavigationFixture />
        <output hidden data-testid="community-calls">
          {operations}
        </output>
      </>
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
        ) : location.pathname.startsWith("/account/roles") ? (
          <AccountRoles />
        ) : null}
        {location.pathname === "/account/billing" ? (
          <PremiumPurchases />
        ) : location.pathname.endsWith("/premium") ? (
          <PremiumPurchases discordGuildId="333333333333333333" />
        ) : location.pathname.endsWith("/checkout") ? (
          <CheckoutReturn
            discordGuildId="333333333333333333"
            sessionId="cs_test_fixture"
          />
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

function NavigationFixture() {
  const pathname = usePathname()
  const guildId = pathname.split("/")[2]
  const [preloads, setPreloads] = useState<{
    guilds: Preloaded<
      typeof api.queries.dashboard.discord.guilds.manageable.list
    >
    staff: Preloaded<typeof api.queries.dashboard.staff.access.get>
  }>()
  useEffect(() => {
    let active = true
    const options = { url: location.origin, skipConvexDeploymentUrlCheck: true }
    void Promise.all([
      preloadQuery(
        api.queries.dashboard.discord.guilds.manageable.list,
        {},
        options
      ),
      preloadQuery(api.queries.dashboard.staff.access.get, {}, options),
    ]).then(([guilds, staff]) => {
      if (active) setPreloads({ guilds, staff })
    })
    return () => {
      active = false
    }
  }, [])
  if (!preloads) return <p>Loading fixture</p>
  return (
    <DashboardShellClient
      preloadedManageableGuilds={preloads.guilds}
      preloadedStaffAccess={preloads.staff}
    >
      <div className="w-full min-w-0">
        <DashboardDiscordHydrator />
        {pathname === "/dashboard" ? (
          <DashboardEntry />
        ) : pathname === "/dashboard/servers" ? (
          <DiscordDashboardPageShell />
        ) : pathname === "/account/billing" ? (
          <PremiumPurchases />
        ) : pathname.endsWith("/premium") ? (
          <PremiumPurchases key={guildId} discordGuildId={guildId} />
        ) : pathname.endsWith("/settings") ? (
          <SettingsSection discordGuildId={guildId ?? ""} />
        ) : (
          <h1>Server overview</h1>
        )}
      </div>
    </DashboardShellClient>
  )
}

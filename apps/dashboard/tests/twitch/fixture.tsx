import React from "react"
import { createRoot } from "react-dom/client"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { FunctionReturnType } from "convex/server"
import { AppPlatformSelector } from "../../src/features/app-shell/AppPlatformSelector"
import { useAppShellStore } from "../../src/components/stores/app-shell-store"
import { ChatTimers } from "../../src/features/twitch/ChatTimers"
import { TwitchWorkspace } from "../../src/features/twitch/TwitchWorkspace"
import Link, { usePathname } from "./navigation-fixture"
import { editedTimerCursor } from "@workspace/shared/twitchTimers"

// Test-only transport outside Next routes. No provider or backend calls.
type View = FunctionReturnType<typeof api.twitchTimers.list>
const listeners = new Set<() => void>()
const locked = new URLSearchParams(location.search).has("locked")
const expiry = new URLSearchParams(location.search).has("expiry")
const staleGuild = new URLSearchParams(location.search).has("staleGuild")
const failure = new URLSearchParams(location.search).get("fail")
const staleHealth = new URLSearchParams(location.search).has("staleHealth")
let failed = false
let view: View = {
  entitlement: {
    limit: locked ? 1 : 3,
    source: locked ? "free" : "testGrant",
    expiresAt: locked ? null : Date.now() + (expiry ? 5000 : 86400000),
  },
  connected: true,
  draftScope: {
    userId: "fixture-user-a" as NonNullable<View["draftScope"]>["userId"],
    broadcasterId: "222",
  },
  groups: [
    {
      id: "timer1" as View["groups"][number]["id"],
      name: "Community links",
      enabled: true,
      intervalMinutes: 15,
      minimumMessages: 5,
      messages: [
        "Join our community at example.com",
        "Follow the channel for the next stream",
      ],
      revision: 1,
      cursor: 0,
      sessionLive: !new URLSearchParams(location.search).has("offline"),
      locked: false,
      broadcasterChanged: false,
      diagnostic: "waitingForActivity",
      diagnosticAt: staleHealth ? Date.now() - 100000 : Date.now(),
    },
  ],
}
if (locked || expiry || failure === "entitlement")
  view.groups.push({
    ...view.groups[0]!,
    id: "timer2" as View["groups"][number]["id"],
    name: "Subscriber reminders",
    locked,
  })
let health = {
  activated: true,
  botReady: true,
  botValidUntil: Date.now() + (staleHealth ? 5000 : 90000),
  authorization: "ready",
  chat: "ready",
  checkedAt: Date.now(),
}
const settings = { configs: [], subscriptions: [] }
const connection = {
  providerAccountId: "222",
  displayName: "Example broadcaster",
  username: "example",
  hasBootstrapPermission: true,
  syncedAt: Date.now(),
}
const guilds = [{ discordGuildId: "123456789012345678", lastOpenedAt: 10 }]
useAppShellStore.setState({
  selectedDiscordGuildId: staleGuild
    ? "999999999999999999"
    : "123456789012345678",
})
const client = new ConvexReactClient("https://twitch-fixture.invalid")
client.watchQuery = (...[reference]) => ({
  localQueryResult: () => {
    switch (getFunctionName(reference)) {
      case "twitchTimers:list":
        return view
      case "twitchChat:status":
        return health
      case "queries/dashboard/discord/guilds/manageable:list":
        return staleGuild ? [] : guilds
      case "queries/dashboard/twitch/connection:get":
        return connection
      case "twitchEventSub:settings":
        return settings
      default:
        throw new Error(
          `Unexpected fixture query ${getFunctionName(reference)}`
        )
    }
  },
  onUpdate: (callback) => {
    listeners.add(callback)
    return () => listeners.delete(callback)
  },
  localQueryLogs: () => undefined,
  journal: () => undefined,
})
client.mutation = async (reference, args) => {
  if (getFunctionName(reference) === "twitchTimers:save") {
    const value = args as View["groups"][number]
    if (
      !failed &&
      (failure === (value.id ? "edit" : "create") ||
        failure === "conflict" ||
        failure === "entitlement")
    ) {
      failed = true
      if (failure === "conflict")
        view = {
          ...view,
          groups: view.groups.map((group) => ({
            ...group,
            revision: group.revision + 1,
          })),
        }
      if (failure === "entitlement")
        view = {
          ...view,
          entitlement: { limit: 1, source: "free", expiresAt: null },
          groups: view.groups.map((group, index) => ({
            ...group,
            locked: index > 0,
          })),
        }
      listeners.forEach((callback) => callback())
      throw new Error("Fixture rejected save")
    }
    const previous = view.groups.find((group) => group.id === value.id)
    if (previous && previous.revision !== value.revision)
      throw new Error("Revision conflict")
    if (previous?.locked && value.enabled && !previous.enabled)
      throw new Error("Premium access is required to enable this group.")
    const id = value.id ?? "timer2"
    const group = {
      ...value,
      id,
      revision: (value.revision ?? 0) + 1,
      cursor: previous ? editedTimerCursor(previous, value.messages) : 0,
      sessionLive: previous?.sessionLive ?? false,
      locked: previous?.locked ?? false,
      broadcasterChanged: false,
    }
    view = {
      ...view,
      groups: [...view.groups.filter((g) => g.id !== id), group],
    }
    listeners.forEach((callback) => callback())
    return id
  }
  if (getFunctionName(reference) === "twitchTimers:remove") {
    if (!failed && failure === "delete") {
      failed = true
      throw new Error("Fixture rejected delete")
    }
    const { id } = args as { id: string }
    view = { ...view, groups: view.groups.filter((g) => g.id !== id) }
    listeners.forEach((callback) => callback())
    return null
  }
  throw new Error("Unexpected fixture mutation")
}
window.addEventListener("timer-fixture", (event) => {
  if (!(event instanceof CustomEvent)) return
  const detail: unknown = event.detail
  if (!detail || typeof detail !== "object") return
  if ("account" in detail && typeof detail.account === "string")
    view = {
      ...view,
      draftScope: {
        userId: detail.account as NonNullable<View["draftScope"]>["userId"],
        broadcasterId: view.draftScope!.broadcasterId,
      },
    }
  if ("broadcaster" in detail && typeof detail.broadcaster === "string")
    view = {
      ...view,
      draftScope: {
        userId: view.draftScope!.userId,
        broadcasterId: detail.broadcaster,
      },
    }
  if ("revision" in detail && typeof detail.revision === "number") {
    const revision = detail.revision
    view = {
      ...view,
      groups: view.groups.map((group) => ({ ...group, revision })),
    }
  }
  if ("live" in detail && typeof detail.live === "boolean") {
    const live = detail.live
    view = {
      ...view,
      groups: view.groups.map((group) => ({
        ...group,
        sessionLive: live,
        diagnostic: live ? "waitingForActivity" : "waitingForStream",
        diagnosticAt: Date.now(),
      })),
    }
  }
  if ("newStream" in detail && detail.newStream === true)
    view = {
      ...view,
      groups: view.groups.map((group) => ({
        ...group,
        cursor: 0,
        sessionLive: true,
        diagnostic: "waitingForActivity",
        diagnosticAt: Date.now(),
      })),
    }
  if ("cursor" in detail && typeof detail.cursor === "number") {
    const cursor = detail.cursor
    view = {
      ...view,
      groups: view.groups.map((group) => ({ ...group, cursor })),
    }
  }
  if ("providerUnavailable" in detail && detail.providerUnavailable === true)
    view = {
      ...view,
      groups: view.groups.map((group) => ({
        ...group,
        diagnostic: "providerUnavailable",
        diagnosticAt: Date.now(),
      })),
    }
  if ("revoked" in detail && detail.revoked === true)
    health = { ...health, authorization: "stale" }
  if ("restore" in detail && detail.restore === true)
    view = {
      ...view,
      entitlement: {
        limit: 3,
        source: "testGrant",
        expiresAt: Date.now() + 60000,
      },
      groups: view.groups.map((group) => ({ ...group, locked: false })),
    }
  listeners.forEach((callback) => callback())
})
function Fixture() {
  const path = usePathname()
  const page = path.endsWith("/timers")
    ? "Chatbot timers"
    : path.endsWith("/alerts")
      ? "Chat alerts"
      : path.startsWith("/dashboard")
        ? "Discord"
        : "Twitch overview"
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <span className="px-2 py-3 font-heading">CleoAI</span>
          <AppPlatformSelector />
        </SidebarHeader>
        <SidebarContent>
          <nav className="flex flex-col gap-3 p-4 group-data-[collapsible=icon]:hidden">
            <Link href="/twitch">Overview</Link>
            <Link href="/twitch/alerts">Chat alerts</Link>
            <Link href="/twitch/timers">Chatbot timers</Link>
          </nav>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-3 border-b p-4">
          <SidebarTrigger />
          <span>{page}</span>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-5 md:p-8">
          <h1 className="font-heading text-2xl font-medium">{page}</h1>
          {path.endsWith("/timers") ? (
            <ChatTimers />
          ) : path.endsWith("/alerts") ? (
            <TwitchWorkspace view="alerts" />
          ) : path.startsWith("/dashboard") ? (
            <p>Discord workspace</p>
          ) : (
            <TwitchWorkspace />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
const root = document.getElementById("root")
if (!root) throw new Error("Missing browser fixture root")
createRoot(root).render(
  <ConvexProvider client={client}>
    <Fixture />
  </ConvexProvider>
)

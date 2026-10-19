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

// Test-only transport outside Next routes. No provider or backend calls.
type View = FunctionReturnType<typeof api.twitchTimers.list>
const listeners = new Set<() => void>()
const locked = new URLSearchParams(location.search).has("locked")
const staleGuild = new URLSearchParams(location.search).has("staleGuild")
let view: View = {
  entitlement: {
    limit: locked ? 1 : 3,
    source: locked ? "free" : "testGrant",
    expiresAt: locked ? null : Date.now() + 86400000,
  },
  connected: true,
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
      locked,
      broadcasterChanged: false,
      diagnostic: "waitingForActivity",
      diagnosticAt: Date.now(),
    },
  ],
}
const health = {
  activated: true,
  botReady: true,
  botValidUntil: Date.now() + 90000,
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
    const id = value.id ?? "timer2"
    const group = {
      ...value,
      id,
      revision: (value.revision ?? 0) + 1,
      cursor: 0,
      locked: false,
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
    const { id } = args as { id: string }
    view = { ...view, groups: view.groups.filter((g) => g.id !== id) }
    listeners.forEach((callback) => callback())
    return null
  }
  throw new Error("Unexpected fixture mutation")
}
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

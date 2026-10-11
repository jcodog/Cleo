import React, { useState, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { LiveNotificationsSection } from "../../src/features/discord-guild-workspace/sections/LiveNotificationsSection"
import type { GuildOverview } from "../../src/features/discord-guild-workspace/types"
import type { LiveNotificationsView } from "../../src/features/discord-guild-workspace/sections/useLiveNotifications"

declare global {
  interface Window {
    liveIdentity: string
    liveFixture: {
      verify(status?: "ready" | "stale" | "unavailable"): void
      navigate(visible: boolean): void
      updateConfig(): void
      rejectSaves: boolean
      saves: unknown[]
      pending(): number
    }
  }
}
const guild = "123456789012345678"
let projection = {
  ownerKey: "fixture-owner",
  config: {
    liveNotificationsEnabled: true,
    liveNotificationMentionMode: "none" as const,
    liveNotificationChannelId: "234567890123456789",
    updatedAt: 1,
  },
  source: { status: "stale" as const },
  discordStatus: "unavailable" as const,
  isOwner: true,
  botLeft: false,
  subscriptionStatus: "ready" as const,
}
const listeners = new Set<() => void>()
const pending: ((result: unknown) => void)[] = []
const client = new ConvexReactClient("https://live-fixture.invalid")
// Test-only transport, no provider calls or production auth overrides.
client.watchQuery = () => ({
  localQueryResult: () => projection,
  onUpdate: (callback) => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },
  localQueryLogs: () => undefined,
  journal: () => undefined,
})
client.action = async (reference, args) => {
  const name = getFunctionName(reference)
  if (name === "liveNotificationActions:get")
    return new Promise((resolve) => pending.push(resolve))
  if (name === "liveNotificationActions:update") {
    if (window.liveFixture.rejectSaves)
      throw Error("Fresh provider verification rejected this save")
    window.liveFixture.saves.push(args)
    return 10
  }
  return {
    status: "ready",
    channels: [
      { id: "234567890123456789", name: "live", type: "text" },
      { id: "345678901234567890", name: "updates", type: "text" },
    ],
    roles: [],
  }
}
window.liveIdentity = "fixture-user"
window.liveFixture = {
  verify(status = "ready") {
    const source: LiveNotificationsView["source"] =
      status === "ready"
        ? {
            status,
            broadcasterId: "123",
            login: "owner",
            displayName: "Server owner",
          }
        : { status }
    pending.splice(0).forEach((resolve) =>
      resolve({
        ...projection,
        source,
        discordStatus: "ready",
        verifiedAt: Date.now(),
      })
    )
  },
  navigate: () => {},
  updateConfig() {
    projection = {
      ...projection,
      config: {
        ...projection.config,
        updatedAt: projection.config.updatedAt + 1,
      },
    }
    listeners.forEach((callback) => callback())
  },
  rejectSaves: false,
  saves: [],
  pending: () => pending.length,
}
function Fixture() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    window.liveFixture.navigate = setVisible
  }, [])
  return (
    <ConvexProvider client={client}>
      {visible ? (
        <LiveNotificationsSection
          overview={{ discordGuildId: guild } as GuildOverview}
          isBotLeft={false}
        />
      ) : null}
    </ConvexProvider>
  )
}
const root = document.getElementById("root")
if (!root) throw Error("Missing fixture root")
createRoot(root).render(<Fixture />)

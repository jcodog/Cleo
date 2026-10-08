import React from "react"
import { createRoot } from "react-dom/client"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { WelcomeSection } from "../../src/features/discord-guild-workspace/sections/WelcomeSection"
import type { GuildOverview } from "../../src/features/discord-guild-workspace/types"

declare global {
  interface Window {
    welcomeTestSaves: unknown[]
    welcomeImageDraws: { source: string; x: number; y: number; width: number }[]
  }
}
// Isolated test transport. This fixture is outside Next's app/routes and never
// grants an entitlement or contacts Clerk, Convex or a live Discord guild.
window.welcomeTestSaves = []
window.welcomeImageDraws = []
const originalDraw = CanvasRenderingContext2D.prototype.drawImage
CanvasRenderingContext2D.prototype.drawImage = function (
  image: CanvasImageSource,
  ...coordinates: number[]
) {
  if (image instanceof HTMLImageElement)
    window.welcomeImageDraws.push({
      source: image.src,
      x: coordinates[0] ?? 0,
      y: coordinates[1] ?? 0,
      width: coordinates[2] ?? image.width,
    })
  Reflect.apply(originalDraw, this, [image, ...coordinates])
}
const client = new ConvexReactClient("https://welcome-fixture.invalid")
client.action = async () => ({
  status: "ready",
  channels: [{ id: "234567890123456789", name: "welcome", type: "text" }],
  roles: [],
})
client.mutation = async (_reference, args) => {
  window.welcomeTestSaves.push(args)
  return {}
}
const overview = {
  guildId: "fixture",
  discordGuildId: "123456789012345678",
  name: "Cleo HQ 🇬🇧",
  // Only this test fixture can simulate the future verified Premium response.
  welcomeCardStudioAvailable:
    new URLSearchParams(location.search).get("guild") === "premium",
  guildConfig: {
    welcomeEnabled: true,
    welcomeChannelId: "234567890123456789",
    welcomeSubtext: "Hello 👩🏾‍💻 🇬🇧",
  },
} as GuildOverview
const root = document.getElementById("root")
if (!root) throw new Error("Test fixture root missing")
createRoot(root).render(
  <ConvexProvider client={client}>
    <WelcomeSection overview={overview} isBotLeft={false} />
  </ConvexProvider>
)

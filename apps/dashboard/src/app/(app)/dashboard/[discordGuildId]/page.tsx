import type { Metadata } from "next"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { preloadQuery } from "convex/nextjs"

import { DiscordGuildWorkspacePageShell } from "@/features/discord-guild-workspace"
import { getConvexAuthToken } from "@/lib/convex-auth"

export const metadata: Metadata = {
  title: "Server overview",
}

type DiscordGuildWorkspacePageProps = {
  params: Promise<{
    discordGuildId: string
  }>
}

export default async function DiscordGuildWorkspacePage({
  params,
}: DiscordGuildWorkspacePageProps) {
  const { discordGuildId } = await params
  const token = await getConvexAuthToken()
  const preloadedOverview = await preloadQuery(
    api.queries.dashboard.discord.guilds.overview.get,
    { discordGuildId },
    { token }
  )

  return (
    <DiscordGuildWorkspacePageShell
      preloadedOverview={preloadedOverview}
    />
  )
}

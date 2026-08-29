import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { preloadQuery } from "convex/nextjs"

import {
  DiscordGuildWorkspacePageShell,
  type DiscordGuildSection,
} from "@/features/discord-guild-workspace"
import { DISCORD_GUILD_SECTIONS } from "@/features/discord-guild-workspace/sections"
import { getConvexAuthToken } from "@/lib/convex-auth"

const DISCORD_SECTIONS = new Set<string>(DISCORD_GUILD_SECTIONS)

type DiscordGuildSectionPageProps = {
  params: Promise<{
    discordGuildId: string
    section: string
  }>
}

const SECTION_TITLES: Record<string, string> = {
  logs: "Logs",
  moderation: "Moderation",
  overview: "Overview",
  settings: "Settings",
  support: "Support",
  welcome: "Welcome",
}

export async function generateMetadata({
  params,
}: DiscordGuildSectionPageProps): Promise<Metadata> {
  const { section } = await params

  return {
    title: SECTION_TITLES[section] ?? "Discord server",
  }
}

export default async function DiscordGuildSectionPage({
  params,
}: DiscordGuildSectionPageProps) {
  const { discordGuildId, section } = await params

  if (!DISCORD_SECTIONS.has(section)) {
    notFound()
  }

  const token = await getConvexAuthToken()
  const preloadedOverview = await preloadQuery(
    api.queries.dashboard.discord.guilds.overview.get,
    { discordGuildId },
    { token }
  )

  return (
    <DiscordGuildWorkspacePageShell
      preloadedOverview={preloadedOverview}
      section={section as DiscordGuildSection}
    />
  )
}

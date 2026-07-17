import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  DiscordGuildWorkspacePageShell,
  type DiscordGuildSection,
} from "@/features/discord-guild-workspace"
import { DISCORD_GUILD_SECTIONS } from "@/features/discord-guild-workspace/sections"

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
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  const { discordGuildId, section } = await params

  if (!DISCORD_SECTIONS.has(section)) {
    notFound()
  }

  return (
    <DiscordGuildWorkspacePageShell
      discordGuildId={discordGuildId}
      section={section as DiscordGuildSection}
    />
  )
}

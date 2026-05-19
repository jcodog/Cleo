import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import {
  DISCORD_GUILD_SECTIONS,
  DiscordGuildWorkspacePageShell,
  type DiscordGuildSection,
} from "@/features/discord-guild-workspace"

const DISCORD_SECTIONS = new Set<string>(DISCORD_GUILD_SECTIONS)

type DiscordGuildSectionPageProps = {
  params: Promise<{
    discordGuildId: string
    section: string
  }>
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

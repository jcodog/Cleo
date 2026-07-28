import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { DiscordGuildWorkspacePageShell } from "@/features/discord-guild-workspace"

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
  await auth.protect()

  const { discordGuildId } = await params

  return <DiscordGuildWorkspacePageShell discordGuildId={discordGuildId} />
}

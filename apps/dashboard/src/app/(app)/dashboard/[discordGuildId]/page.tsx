import { auth } from "@clerk/nextjs/server"

import { DiscordGuildWorkspacePageShell } from "@/features/discord-guild-workspace"

type DiscordGuildWorkspacePageProps = {
  params: Promise<{
    discordGuildId: string
  }>
}

export default async function DiscordGuildWorkspacePage({
  params,
}: DiscordGuildWorkspacePageProps) {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  const { discordGuildId } = await params

  return <DiscordGuildWorkspacePageShell discordGuildId={discordGuildId} />
}

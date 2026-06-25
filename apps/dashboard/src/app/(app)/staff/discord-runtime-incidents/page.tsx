import { auth } from "@clerk/nextjs/server"

import { DiscordRuntimeIncidentsPageShell } from "@/features/staff/discord-runtime-incidents/DiscordRuntimeIncidentsPageShell"

export default async function DiscordRuntimeIncidentsPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <DiscordRuntimeIncidentsPageShell />
}

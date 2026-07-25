import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { DiscordRuntimeIncidentsPageShell } from "@/features/staff/discord-runtime-incidents/DiscordRuntimeIncidentsPageShell"

export const metadata: Metadata = {
  title: "Runtime incidents",
}

export default async function DiscordRuntimeIncidentsPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <DiscordRuntimeIncidentsPageShell />
}

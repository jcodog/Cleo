import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { DiscordDashboardPageShell } from "@/features/dashboard/DiscordDashboardPageShell"

export const metadata: Metadata = {
  title: "Discord",
}

export default async function DashboardPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <DiscordDashboardPageShell />
}

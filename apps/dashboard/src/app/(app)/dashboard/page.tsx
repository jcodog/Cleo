import { auth } from "@clerk/nextjs/server"

import { DiscordDashboardPageShell } from "@/features/dashboard/DiscordDashboardPageShell"

export default async function DashboardPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <DiscordDashboardPageShell />
}

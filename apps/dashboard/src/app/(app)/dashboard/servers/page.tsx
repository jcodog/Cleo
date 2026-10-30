import { auth } from "@clerk/nextjs/server"
import { DiscordDashboardPageShell } from "@/features/dashboard/DiscordDashboardPageShell"

export const metadata = { title: "Servers" }

export default async function ServersPage() {
  await auth.protect()
  return <DiscordDashboardPageShell />
}

import { auth } from "@clerk/nextjs/server"
import { cookies } from "next/headers"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { DiscordDashboardPageShell } from "@/features/dashboard/DiscordDashboardPageShell"
import {
  getLastDiscordGuildDashboardPath,
  LAST_DISCORD_GUILD_COOKIE,
} from "@/features/auth/lastGuildPreference"

export const metadata: Metadata = {
  title: "Discord",
}

export default async function DashboardPage() {
  const { userId } = await auth.protect()
  const cookieStore = await cookies()
  const destination = getLastDiscordGuildDashboardPath(
    cookieStore.get(LAST_DISCORD_GUILD_COOKIE)?.value,
    userId
  )

  if (destination !== "/dashboard") {
    redirect(destination)
  }

  return <DiscordDashboardPageShell />
}

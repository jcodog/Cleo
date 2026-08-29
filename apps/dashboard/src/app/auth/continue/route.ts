import { auth } from "@clerk/nextjs/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  getLastDiscordGuildDashboardPath,
  LAST_DISCORD_GUILD_COOKIE,
} from "@/features/auth/lastGuildPreference"

export async function GET(request: Request) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }

  const cookieStore = await cookies()
  const destination = getLastDiscordGuildDashboardPath(
    cookieStore.get(LAST_DISCORD_GUILD_COOKIE)?.value,
    userId
  )

  return NextResponse.redirect(new URL(destination, request.url))
}

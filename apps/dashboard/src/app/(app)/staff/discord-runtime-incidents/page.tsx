import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { DiscordRuntimeIncidentsPageShell } from "@/features/staff/discord-runtime-incidents/DiscordRuntimeIncidentsPageShell"

export const metadata: Metadata = {
  title: "Runtime incidents",
}

export default async function DiscordRuntimeIncidentsPage() {
  await auth.protect()

  return <DiscordRuntimeIncidentsPageShell />
}

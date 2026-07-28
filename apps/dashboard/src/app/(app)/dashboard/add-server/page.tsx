import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { DiscordAddServerPageShell } from "@/features/add-server"

export const metadata: Metadata = {
  title: "Add a Discord server",
}

export default async function DiscordAddServerPage() {
  await auth.protect()

  return <DiscordAddServerPageShell />
}

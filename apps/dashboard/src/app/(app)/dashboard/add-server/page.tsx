import { auth } from "@clerk/nextjs/server"

import { DiscordAddServerPageShell } from "@/features/add-server"

export default async function DiscordAddServerPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <DiscordAddServerPageShell />
}

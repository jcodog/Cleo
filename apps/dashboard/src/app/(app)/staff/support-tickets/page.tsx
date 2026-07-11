import { auth } from "@clerk/nextjs/server"

import { SupportTicketsPageShell } from "@/features/staff/support-tickets/SupportTicketsPageShell"

export default async function SupportTicketsPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <SupportTicketsPageShell />
}

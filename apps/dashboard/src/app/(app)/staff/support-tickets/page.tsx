import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { SupportTicketsPageShell } from "@/features/staff/support-tickets/SupportTicketsPageShell"

export const metadata: Metadata = {
  title: "Support tickets",
}

export default async function SupportTicketsPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <SupportTicketsPageShell />
}

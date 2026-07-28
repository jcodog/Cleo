import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { SupportTicketsPageShell } from "@/features/staff/support-tickets/SupportTicketsPageShell"

export const metadata: Metadata = {
  title: "Support tickets",
}

export default async function SupportTicketsPage() {
  await auth.protect()

  return <SupportTicketsPageShell />
}

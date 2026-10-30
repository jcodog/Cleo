import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { DashboardEntry } from "@/features/dashboard/DashboardEntry"
import { loadDashboardEntrySnapshot } from "@/features/dashboard/loadDashboardEntrySnapshot"

export const metadata: Metadata = {
  title: "Discord",
}

export default async function DashboardPage() {
  await auth.protect()

  return (
    <DashboardEntry initialDirectory={await loadDashboardEntrySnapshot()} />
  )
}

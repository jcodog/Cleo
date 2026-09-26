import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { StaffOverviewPageShell } from "@/features/staff/StaffOverviewPageShell"

export const metadata: Metadata = {
  title: "Staff",
}

export default async function StaffPage() {
  await auth.protect()

  return <StaffOverviewPageShell />
}

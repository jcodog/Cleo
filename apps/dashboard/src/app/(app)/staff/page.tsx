import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Staff",
}

export default async function StaffPage() {
  await auth.protect()

  redirect("/staff/support-tickets")
}

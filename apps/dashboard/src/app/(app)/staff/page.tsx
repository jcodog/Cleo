import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

export default async function StaffPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  redirect("/staff/discord-runtime-incidents")
}

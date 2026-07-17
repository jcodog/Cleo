import { Suspense } from "react"
import type { Metadata } from "next"

import { DiscordAuthPage } from "@/features/auth/DiscordAuthPage"

export const metadata: Metadata = {
  title: "Create account",
  description: "Use Discord to get started with Cleo.",
}

export default function SignUpPage() {
  return (
    <Suspense>
      <DiscordAuthPage mode="sign-up" />
    </Suspense>
  )
}

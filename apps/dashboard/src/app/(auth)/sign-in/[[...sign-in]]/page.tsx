import { Suspense } from "react"
import type { Metadata } from "next"

import { DiscordAuthPage } from "@/features/auth/DiscordAuthPage"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Continue to Cleo with your Discord account.",
}

export default function SignInPage() {
  return (
    <Suspense>
      <DiscordAuthPage mode="sign-in" />
    </Suspense>
  )
}

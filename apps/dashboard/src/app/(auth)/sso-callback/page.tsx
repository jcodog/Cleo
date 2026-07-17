import { Suspense } from "react"
import type { Metadata } from "next"

import { DiscordOAuthCallback } from "@/features/auth/DiscordOAuthCallback"

export const metadata: Metadata = {
  title: "Connecting Discord",
}

export default function SsoCallbackPage() {
  return (
    <Suspense>
      <DiscordOAuthCallback />
    </Suspense>
  )
}

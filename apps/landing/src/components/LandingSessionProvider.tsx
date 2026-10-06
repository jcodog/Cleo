"use client"

import { ClerkProvider } from "@clerk/nextjs"
import type { ReactNode } from "react"

export function LandingSessionProvider({
  children,
  publishableKey,
  origin,
}: {
  children: ReactNode
  publishableKey: string | undefined
  origin: string
}) {
  if (!publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be set for landing session awareness."
    )
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl={`${origin}/sign-in`}
      signUpUrl={`${origin}/sign-up`}
    >
      {children}
    </ClerkProvider>
  )
}

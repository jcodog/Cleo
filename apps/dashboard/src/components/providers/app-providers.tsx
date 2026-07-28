"use client"

import { type ReactNode } from "react"
import { ClerkProvider, useAuth } from "@clerk/nextjs"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { dark, shadcn } from "@clerk/themes"

import { useTheme } from "@/components/providers/theme-provider"
import { convexClient } from "@/lib/convexClient"

export function AppProviders({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme()

  if (!convexClient) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL must be set to initialize Convex.")
  }

  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/onboarding"
      signInUrl="/sign-in"
      signUpFallbackRedirectUrl="/onboarding"
      signUpUrl="/sign-up"
      taskUrls={{
        "choose-organization": "/session-tasks/choose-organization",
        "reset-password": "/session-tasks/reset-password",
        "setup-mfa": "/session-tasks/setup-mfa",
      }}
      appearance={{
        theme: resolvedTheme === "dark" ? [dark, shadcn] : [shadcn],
      }}
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

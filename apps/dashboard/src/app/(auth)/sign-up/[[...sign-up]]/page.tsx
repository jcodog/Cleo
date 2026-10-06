import { SignUp } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthShell } from "@/features/auth/AuthShell"
import { clerkAuthAppearance } from "@/features/auth/clerkAuthAppearance"
import { getProductReturnPath } from "@/features/auth/applicationEntry"
import { withReturnTo } from "@/features/auth/safeRedirect"

export const metadata: Metadata = {
  title: "Create account",
  description: "Use Discord to get started with Cleo.",
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const { returnTo } = await searchParams
  const destination = getProductReturnPath(
    typeof returnTo === "string" ? returnTo : null
  )
  return (
    <AuthShell>
      <SignUp
        appearance={clerkAuthAppearance}
        forceRedirectUrl={destination ?? "/onboarding"}
        signInForceRedirectUrl={destination ?? "/"}
        signInUrl={
          destination ? withReturnTo("/sign-in", destination) : "/sign-in"
        }
      />
    </AuthShell>
  )
}

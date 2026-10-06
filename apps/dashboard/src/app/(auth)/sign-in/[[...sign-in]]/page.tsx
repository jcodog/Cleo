import { SignIn } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthShell } from "@/features/auth/AuthShell"
import { clerkAuthAppearance } from "@/features/auth/clerkAuthAppearance"
import { getProductReturnPath } from "@/features/auth/applicationEntry"
import { withReturnTo } from "@/features/auth/safeRedirect"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Continue to Cleo with your Discord account.",
}

export default async function SignInPage({
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
      <SignIn
        appearance={clerkAuthAppearance}
        forceRedirectUrl={destination ?? "/"}
        signUpForceRedirectUrl={destination ?? "/onboarding"}
        signUpUrl={
          destination ? withReturnTo("/sign-up", destination) : "/sign-up"
        }
      />
    </AuthShell>
  )
}

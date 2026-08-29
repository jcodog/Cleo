import { SignUp } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthShell } from "@/features/auth/AuthShell"
import {
  SIGN_IN_DEFAULT_RETURN_TO,
  SIGN_UP_DEFAULT_RETURN_TO,
} from "@/features/auth/authContinuation"
import { clerkAuthAppearance } from "@/features/auth/clerkAuthAppearance"

export const metadata: Metadata = {
  title: "Create account",
  description: "Use Discord to get started with Cleo.",
}

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp
        appearance={clerkAuthAppearance}
        fallbackRedirectUrl={SIGN_UP_DEFAULT_RETURN_TO}
        path="/sign-up"
        routing="path"
        signInFallbackRedirectUrl={SIGN_IN_DEFAULT_RETURN_TO}
        signInUrl="/sign-in"
      />
    </AuthShell>
  )
}

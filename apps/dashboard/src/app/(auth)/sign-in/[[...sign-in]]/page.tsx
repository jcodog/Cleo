import { SignIn } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthShell } from "@/features/auth/AuthShell"
import {
  SIGN_IN_DEFAULT_RETURN_TO,
  SIGN_UP_DEFAULT_RETURN_TO,
} from "@/features/auth/authContinuation"
import { clerkAuthAppearance } from "@/features/auth/clerkAuthAppearance"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Continue to Cleo with your Discord account.",
}

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn
        appearance={clerkAuthAppearance}
        fallbackRedirectUrl={SIGN_IN_DEFAULT_RETURN_TO}
        path="/sign-in"
        routing="path"
        signUpFallbackRedirectUrl={SIGN_UP_DEFAULT_RETURN_TO}
        signUpUrl="/sign-up"
      />
    </AuthShell>
  )
}

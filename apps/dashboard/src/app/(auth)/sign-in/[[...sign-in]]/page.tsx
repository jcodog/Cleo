import { SignIn } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthShell } from "@/features/auth/AuthShell"
import { clerkAuthAppearance } from "@/features/auth/clerkAuthAppearance"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Continue to Cleo with your Discord account.",
}

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn appearance={clerkAuthAppearance} />
    </AuthShell>
  )
}

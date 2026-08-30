import { SignUp } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthShell } from "@/features/auth/AuthShell"
import { clerkAuthAppearance } from "@/features/auth/clerkAuthAppearance"

export const metadata: Metadata = {
  title: "Create account",
  description: "Use Discord to get started with Cleo.",
}

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp appearance={clerkAuthAppearance} />
    </AuthShell>
  )
}

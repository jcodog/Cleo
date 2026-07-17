import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

import { OnboardingExperience } from "@/features/onboarding/OnboardingExperience"

export const metadata: Metadata = {
  title: "Welcome",
  description: "Connect your Cleo account and choose where to begin.",
}

export default async function OnboardingPage() {
  const authResult = await auth()

  if (!authResult.isAuthenticated) {
    return authResult.redirectToSignIn()
  }

  return <OnboardingExperience />
}

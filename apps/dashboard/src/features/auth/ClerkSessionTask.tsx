"use client"

import { useEffect, useState } from "react"
import {
  TaskChooseOrganization,
  TaskResetPassword,
  TaskSetupMFA,
  useAuth,
} from "@clerk/nextjs"
import { useRouter } from "next/navigation"

import { AuthShell } from "@/features/auth/AuthShell"
import { getSafeInternalPath } from "@/features/auth/safeRedirect"

export function ClerkSessionTask({ task }: { task: string }) {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const [returnTo, setReturnTo] = useState("/onboarding")

  useEffect(() => {
    const storedReturnTo = getSafeInternalPath(
      sessionStorage.getItem("cleo:auth-return-to")
    )

    if (storedReturnTo) {
      setReturnTo(storedReturnTo)
    }

    if (!isLoaded || !isSignedIn) {
      return
    }

    sessionStorage.removeItem("cleo:auth-return-to")
    router.replace(storedReturnTo ?? "/onboarding")
  }, [isLoaded, isSignedIn, router])

  return (
    <AuthShell>
      {task === "choose-organization" ? (
        <TaskChooseOrganization redirectUrlComplete={returnTo} />
      ) : task === "reset-password" ? (
        <TaskResetPassword redirectUrlComplete={returnTo} />
      ) : task === "setup-mfa" ? (
        <TaskSetupMFA redirectUrlComplete={returnTo} />
      ) : (
        <div className="space-y-3">
          <h1 className="font-heading text-3xl font-semibold">
            Sign-in task unavailable
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            This security step is not supported by Cleo. Return to the landing
            page and contact support if it continues.
          </p>
        </div>
      )}
    </AuthShell>
  )
}

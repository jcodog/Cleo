"use client"

import {
  TaskChooseOrganization,
  TaskResetPassword,
  TaskSetupMFA,
} from "@clerk/nextjs"
import { useSearchParams } from "next/navigation"

import { AuthShell } from "@/features/auth/AuthShell"
import { getSessionTaskReturnTo } from "@/features/auth/authContinuation"

export function ClerkSessionTask({ task }: { task: string }) {
  const searchParams = useSearchParams()
  const returnTo = getSessionTaskReturnTo(searchParams.get("returnTo"))

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

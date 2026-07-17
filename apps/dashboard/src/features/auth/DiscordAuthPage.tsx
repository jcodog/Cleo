"use client"

import { useEffect, useState } from "react"
import { IconAlertCircle, IconBrandDiscord } from "@tabler/icons-react"
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { AuthShell } from "@/features/auth/AuthShell"
import { getSafeInternalPath, withReturnTo } from "@/features/auth/safeRedirect"

type AuthMode = "sign-in" | "sign-up"

const COPY = {
  "sign-in": {
    title: "Welcome back to Cleo",
    description: "Continue with your Discord account.",
    action: "Continue with Discord",
    alternate: "New to Cleo?",
    alternateAction: "Create an account",
    alternatePath: "/sign-up",
  },
  "sign-up": {
    title: "Create your Cleo account",
    description: "Use Discord to get started with Cleo.",
    action: "Continue with Discord",
    alternate: "Already use Cleo?",
    alternateAction: "Sign in",
    alternatePath: "/sign-in",
  },
} as const

export function DiscordAuthPage({ mode }: { mode: AuthMode }) {
  const copy = COPY[mode]
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, isSignedIn } = useAuth()
  const {
    signIn,
    errors: signInErrors,
    fetchStatus: signInFetchStatus,
  } = useSignIn()
  const {
    signUp,
    errors: signUpErrors,
    fetchStatus: signUpFetchStatus,
  } = useSignUp()
  const [localError, setLocalError] = useState<string | null>(null)
  const returnTo =
    getSafeInternalPath(searchParams.get("returnTo")) ?? "/onboarding"
  const isFetching =
    mode === "sign-in"
      ? signInFetchStatus === "fetching"
      : signUpFetchStatus === "fetching"
  const hookError = getHookErrorMessage(
    mode === "sign-in" ? signInErrors : signUpErrors
  )
  const errorMessage = localError ?? hookError

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(returnTo)
    }
  }, [isLoaded, isSignedIn, returnTo, router])

  async function startDiscordOAuth() {
    setLocalError(null)

    const callbackParams = new URLSearchParams({
      flow: mode,
      returnTo,
    })
    const params = {
      strategy: "oauth_discord" as const,
      redirectUrl: returnTo,
      redirectCallbackUrl: `/sso-callback?${callbackParams.toString()}`,
    }
    const result =
      mode === "sign-in" ? await signIn.sso(params) : await signUp.sso(params)

    if (result.error) {
      setLocalError(getClerkErrorMessage(result.error))
    }
  }

  const cancelled = searchParams.get("oauth") === "cancelled"

  return (
    <AuthShell>
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-3xl font-semibold tracking-[-0.025em]">
          {copy.title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>

      {cancelled ? (
        <Alert>
          <IconAlertCircle aria-hidden />
          <AlertTitle>Discord sign-in cancelled</AlertTitle>
          <AlertDescription>
            Nothing changed. Continue again when you are ready.
          </AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive">
          <IconAlertCircle aria-hidden />
          <AlertTitle>Discord authentication could not continue</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        className="h-12 w-full"
        disabled={!isLoaded || isSignedIn || isFetching}
        onClick={startDiscordOAuth}
        size="lg"
      >
        {isFetching || !isLoaded ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <IconBrandDiscord aria-hidden data-icon="inline-start" />
        )}
        {isFetching
          ? "Opening Discord…"
          : !isLoaded
            ? "Checking session…"
            : copy.action}
      </Button>

      {mode === "sign-up" ? <div id="clerk-captcha" /> : null}

      <p className="text-sm text-muted-foreground">
        {copy.alternate}{" "}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={withReturnTo(copy.alternatePath, returnTo)}
        >
          {copy.alternateAction}
        </Link>
      </p>
    </AuthShell>
  )
}

export function getClerkErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      longMessage?: unknown
      message?: unknown
    }

    if (typeof candidate.longMessage === "string") {
      return candidate.longMessage
    }

    if (typeof candidate.message === "string") {
      return candidate.message
    }
  }

  return "Cleo could not complete the Discord request. Please try again."
}

function getHookErrorMessage(errors: unknown): string | null {
  if (typeof errors !== "object" || errors === null) {
    return null
  }

  const globalErrors = (errors as { global?: unknown }).global

  if (!Array.isArray(globalErrors) || globalErrors.length === 0) {
    return null
  }

  return getClerkErrorMessage(globalErrors[0])
}

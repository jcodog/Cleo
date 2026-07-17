"use client"

import { useEffect, useRef, useState } from "react"
import { IconAlertCircle, IconBrandDiscord } from "@tabler/icons-react"
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { useRouter, useSearchParams } from "next/navigation"

import { AuthShell } from "@/features/auth/AuthShell"
import { getClerkErrorMessage } from "@/features/auth/DiscordAuthPage"
import { getSafeInternalPath, withReturnTo } from "@/features/auth/safeRedirect"

type CallbackState =
  | { status: "processing" }
  | { status: "error"; message: string }
  | { status: "missing"; message: string }

export function DiscordOAuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clerk = useClerk()
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
  const [state, setState] = useState<CallbackState>({ status: "processing" })
  const attemptKeyRef = useRef<string | null>(null)
  const flow = searchParams.get("flow") === "sign-up" ? "sign-up" : "sign-in"
  const returnTo =
    getSafeInternalPath(searchParams.get("returnTo")) ?? "/onboarding"
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error")

  useEffect(() => {
    if (!isLoaded || state.status !== "processing") {
      return
    }

    if (isSignedIn) {
      router.replace(returnTo)
      return
    }

    if (providerError) {
      setState({
        status: "error",
        message: providerError.toLowerCase().includes("denied")
          ? "The Discord request was cancelled before Cleo received permission."
          : providerError,
      })
      return
    }

    if (signInFetchStatus === "fetching" || signUpFetchStatus === "fetching") {
      return
    }

    const attemptKey = [
      flow,
      signIn.id ?? "none",
      signIn.status ?? "none",
      signUp.id ?? "none",
      signUp.status ?? "none",
      String(signIn.isTransferable),
      String(signUp.isTransferable),
    ].join(":")

    if (attemptKeyRef.current === attemptKey) {
      return
    }

    attemptKeyRef.current = attemptKey

    async function resolveAttempt() {
      const existingSessionId =
        signIn.existingSession?.sessionId ?? signUp.existingSession?.sessionId

      if (existingSessionId) {
        await clerk.setActive({
          session: existingSessionId,
          navigate: ({ decorateUrl, session }) => {
            if (session.currentTask) {
              setState({
                status: "missing",
                message:
                  "This Clerk session needs an additional security step before Cleo can continue.",
              })
              return
            }

            navigateToDecoratedUrl(decorateUrl(returnTo), router)
          },
        })
        return
      }

      if (signIn.status === "complete") {
        const result = await signIn.finalize({
          navigate: ({ decorateUrl, session }) => {
            if (session.currentTask) {
              setState({
                status: "missing",
                message:
                  "This Clerk session needs an additional security step before Cleo can continue.",
              })
              return
            }

            navigateToDecoratedUrl(decorateUrl(returnTo), router)
          },
        })

        if (result.error) {
          setState({
            status: "error",
            message: getClerkErrorMessage(result.error),
          })
        }
        return
      }

      if (signUp.status === "complete") {
        const result = await signUp.finalize({
          navigate: ({ decorateUrl, session }) => {
            if (session.currentTask) {
              setState({
                status: "missing",
                message:
                  "This Clerk session needs an additional security step before Cleo can continue.",
              })
              return
            }

            navigateToDecoratedUrl(decorateUrl(returnTo), router)
          },
        })

        if (result.error) {
          setState({
            status: "error",
            message: getClerkErrorMessage(result.error),
          })
        }
        return
      }

      if (flow === "sign-in" && signIn.isTransferable && !signUp.id) {
        const result = await signUp.create({ transfer: true })

        if (result.error) {
          setState({
            status: "error",
            message: getClerkErrorMessage(result.error),
          })
        }
        return
      }

      if (flow === "sign-up" && signUp.isTransferable && !signIn.id) {
        const result = await signIn.create({ transfer: true })

        if (result.error) {
          setState({
            status: "error",
            message: getClerkErrorMessage(result.error),
          })
        }
        return
      }

      if (signUp.status === "missing_requirements") {
        const fields = signUp.missingFields.join(", ")
        setState({
          status: "missing",
          message: fields
            ? `Discord completed, but Clerk still requires: ${fields}.`
            : "Discord completed, but Clerk still requires account information before Cleo can continue.",
        })
        return
      }

      const hookError = getFirstHookError(signInErrors, signUpErrors)

      if (hookError) {
        setState({ status: "error", message: hookError })
        return
      }

      setState({
        status: "error",
        message:
          "Discord did not return a completable authentication attempt. You can safely try again.",
      })
    }

    void resolveAttempt().catch((error: unknown) => {
      setState({ status: "error", message: getClerkErrorMessage(error) })
    })
  }, [
    clerk,
    flow,
    isLoaded,
    isSignedIn,
    providerError,
    returnTo,
    router,
    signIn,
    signInErrors,
    signInFetchStatus,
    signUp,
    signUpErrors,
    signUpFetchStatus,
    state.status,
  ])

  async function retry() {
    await Promise.all([signIn.reset(), signUp.reset()])
    const path = withReturnTo(
      flow === "sign-up" ? "/sign-up" : "/sign-in",
      returnTo
    )
    router.replace(`${path}&oauth=cancelled`)
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-3xl font-semibold tracking-[-0.025em]">
          {state.status === "processing"
            ? "Finishing with Discord"
            : "Cleo needs your attention"}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {state.status === "processing"
            ? "Cleo is checking the Discord result and preparing your session."
            : "Your account has not been changed beyond the completed Discord step."}
        </p>
      </div>

      {state.status === "processing" ? (
        <div className="flex items-center gap-3 border-y border-white/10 py-5 text-sm">
          <Spinner />
          Checking your Discord session…
        </div>
      ) : (
        <Alert variant={state.status === "error" ? "destructive" : "default"}>
          <IconAlertCircle aria-hidden />
          <AlertTitle>
            {state.status === "missing"
              ? "Account requirements are incomplete"
              : "Discord authentication could not finish"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.status !== "processing" ? (
        <Button className="h-12 w-full" onClick={retry} size="lg">
          <IconBrandDiscord aria-hidden data-icon="inline-start" />
          Try Discord again
        </Button>
      ) : null}
    </AuthShell>
  )
}

function navigateToDecoratedUrl(
  url: string,
  router: ReturnType<typeof useRouter>
) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    window.location.assign(url)
    return
  }

  router.replace(url)
}

function getFirstHookError(...errors: unknown[]): string | null {
  for (const errorState of errors) {
    if (typeof errorState !== "object" || errorState === null) {
      continue
    }

    const globalErrors = (errorState as { global?: unknown }).global

    if (Array.isArray(globalErrors) && globalErrors.length > 0) {
      return getClerkErrorMessage(globalErrors[0])
    }
  }

  return null
}

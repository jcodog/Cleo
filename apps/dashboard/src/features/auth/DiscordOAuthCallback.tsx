"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { IconAlertCircle, IconBrandDiscord } from "@tabler/icons-react"
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Spinner } from "@workspace/ui/components/spinner"
import { useRouter, useSearchParams } from "next/navigation"

import { AuthShell } from "@/features/auth/AuthShell"
import {
  getSessionTaskPath,
  partitionMissingRequirements,
  type SupportedMissingRequirement,
} from "@/features/auth/authContinuation"
import {
  getClerkErrorMessage,
  getClerkOperationError,
} from "@/features/auth/clerkOperations"
import { getSafeInternalPath, withReturnTo } from "@/features/auth/safeRedirect"

type CallbackState =
  | { status: "processing" }
  | { status: "error"; message: string }
  | {
      status: "requirements"
      fields: SupportedMissingRequirement[]
      unsupportedFields: string[]
    }

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
  const [legalAccepted, setLegalAccepted] = useState(false)
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
              const taskPath = getSessionTaskPath(
                session.currentTask.key,
                returnTo
              )

              if (!taskPath) {
                setState({
                  status: "error",
                  message: "Clerk returned an unsupported session task.",
                })
                return
              }

              navigateToDecoratedUrl(decorateUrl(taskPath), router)
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
              const taskPath = getSessionTaskPath(
                session.currentTask.key,
                returnTo
              )

              if (!taskPath) {
                setState({
                  status: "error",
                  message: "Clerk returned an unsupported session task.",
                })
                return
              }

              navigateToDecoratedUrl(decorateUrl(taskPath), router)
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
              const taskPath = getSessionTaskPath(
                session.currentTask.key,
                returnTo
              )

              if (!taskPath) {
                setState({
                  status: "error",
                  message: "Clerk returned an unsupported session task.",
                })
                return
              }

              navigateToDecoratedUrl(decorateUrl(taskPath), router)
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
        const fields = partitionMissingRequirements(signUp.missingFields)
        setState({
          status: "requirements",
          fields: fields.supported,
          unsupportedFields: fields.unsupported,
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

  async function submitMissingRequirements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const fields: SupportedMissingRequirement[] =
      state.status === "requirements" ? state.fields : []
    const updates: {
      firstName?: string
      lastName?: string
      legalAccepted?: boolean
      username?: string
    } = {}

    if (fields.includes("first_name")) {
      updates.firstName = String(formData.get("firstName") ?? "").trim()
    }
    if (fields.includes("last_name")) {
      updates.lastName = String(formData.get("lastName") ?? "").trim()
    }
    if (fields.includes("username")) {
      updates.username = String(formData.get("username") ?? "").trim()
    }
    if (fields.includes("legal_accepted")) {
      updates.legalAccepted = legalAccepted
    }

    setState({ status: "processing" })
    const updateError = await getClerkOperationError(() =>
      signUp.update(updates)
    )

    if (updateError) {
      setState({ status: "error", message: updateError })
      return
    }

    if (signUp.status === "missing_requirements") {
      const nextFields = partitionMissingRequirements(signUp.missingFields)
      setState({
        status: "requirements",
        fields: nextFields.supported,
        unsupportedFields: nextFields.unsupported,
      })
      return
    }

    if (signUp.status !== "complete") {
      setState({
        status: "error",
        message: "Clerk could not complete the account requirements.",
      })
      return
    }

    const finalizeError = await getClerkOperationError(() =>
      signUp.finalize({
        navigate: ({ decorateUrl, session }) => {
          if (session.currentTask) {
            const taskPath = getSessionTaskPath(
              session.currentTask.key,
              returnTo
            )

            if (!taskPath) {
              setState({
                status: "error",
                message: "Clerk returned an unsupported session task.",
              })
              return
            }

            navigateToDecoratedUrl(decorateUrl(taskPath), router)
            return
          }

          navigateToDecoratedUrl(decorateUrl(returnTo), router)
        },
      })
    )

    if (finalizeError) {
      setState({ status: "error", message: finalizeError })
    }
  }

  async function retry() {
    const resetError = await getClerkOperationError(() =>
      Promise.all([signIn.reset(), signUp.reset()])
    )

    if (resetError) {
      setState({
        status: "error",
        message: `${resetError} Retry remains available.`,
      })
      return
    }

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
            : state.status === "requirements"
              ? "Finish the remaining account requirements to continue."
              : "Your Cleo account is unchanged. You can safely retry with Discord."}
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
            {state.status === "requirements"
              ? "Account requirements are incomplete"
              : "Discord authentication could not finish"}
          </AlertTitle>
          <AlertDescription>
            {state.status === "requirements"
              ? state.unsupportedFields.length > 0
                ? `Clerk requires unsupported Discord-only fields: ${state.unsupportedFields.join(", ")}. Contact Cleo support before retrying.`
                : "Add the remaining account information to finish with Discord."
              : state.message}
          </AlertDescription>
        </Alert>
      )}

      {state.status === "requirements" &&
      state.unsupportedFields.length === 0 &&
      state.fields.length > 0 ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={submitMissingRequirements}
        >
          {state.fields.includes("first_name") ? (
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                autoComplete="given-name"
                id="firstName"
                name="firstName"
                required
              />
            </div>
          ) : null}
          {state.fields.includes("last_name") ? (
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                autoComplete="family-name"
                id="lastName"
                name="lastName"
                required
              />
            </div>
          ) : null}
          {state.fields.includes("username") ? (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                autoComplete="username"
                id="username"
                name="username"
                required
              />
            </div>
          ) : null}
          {state.fields.includes("legal_accepted") ? (
            <div className="flex items-start gap-3">
              <Checkbox
                checked={legalAccepted}
                id="legalAccepted"
                onCheckedChange={(checked) =>
                  setLegalAccepted(checked === true)
                }
              />
              <Label className="leading-5" htmlFor="legalAccepted">
                I accept Cleo&apos;s terms and privacy policy.
              </Label>
            </div>
          ) : null}
          <Button
            className="h-12 w-full"
            disabled={state.fields.includes("legal_accepted") && !legalAccepted}
            size="lg"
            type="submit"
          >
            Finish account
          </Button>
        </form>
      ) : state.status !== "processing" ? (
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

"use client"
import { useEffect, useRef, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { useConvexAuth } from "convex/react"
import { useAuth, useUser } from "@clerk/nextjs"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
const failure =
  "Discord verification failed. Start again from Discord with the account linked to Cleo."
/** Reuse Clerk after session restoration; consume direct-fallback state once if supplied. */
export function LinkedRoleCallback({
  code,
  state,
  error,
}: {
  code?: string
  state?: string
  error?: string
}) {
  const begin = useAction(api.communityActions.beginLinkedRoles)
  const finish = useAction(api.communityActions.finishLinkedRoles)
  const connect = useAction(api.communityActions.connectClerkLinkedRoles)
  const { isLoaded, isSignedIn, sessionId } = useAuth()
  const { user } = useUser()
  const { isAuthenticated } = useConvexAuth()
  const connection = useQuery(
    api.discordConnections.status,
    isAuthenticated ? {} : "skip"
  )
  const handled = useRef("")
  const [consentRequired, setConsentRequired] = useState(false)
  const [applicationMismatch, setApplicationMismatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("Verifying your Discord connection...")
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isAuthenticated || !sessionId) return
    const key = `${sessionId}:${code ?? ""}:${state ?? ""}:${error ?? ""}`
    if (handled.current === key) return
    handled.current = key
    const callback = Boolean(code || state || error)
    if (callback) window.history.replaceState(null, "", "/discord/linked-role")
    if (error || (callback && (!code || !state))) {
      return
    }
    if (code && state) {
      void finish({ code, state }).then(
        () =>
          handled.current === key &&
          setNotice(
            "Discord Linked Roles verified. Return to Discord to claim eligible roles."
          ),
        () => handled.current === key && setNotice(failure)
      )
    } else {
      void connect({}).then(
        (status) => {
          if (handled.current !== key) return
          setConsentRequired(status === "consentRequired")
          setApplicationMismatch(status === "applicationMismatch")
          setNotice(
            status === "ready"
              ? "Discord permission verified. Metadata refresh requested. Return to Discord to check eligible Linked Roles."
              : status === "applicationMismatch"
                ? "Clerk's Discord connection uses a different application. The operator must align the client IDs, or you can use Cleo's separate verification below."
                : "Allow Linked Roles once through your existing Discord connection."
          )
        },
        () =>
          handled.current === key &&
          setNotice(
            "Discord verification is unavailable. Reload this page to retry."
          )
      )
    }
  }, [
    connect,
    finish,
    code,
    state,
    error,
    isLoaded,
    isSignedIn,
    isAuthenticated,
    sessionId,
  ])
  /** Request the additional Discord scope only after the user chooses to consent. */
  async function authorize() {
    setBusy(true)
    try {
      const accounts =
        user?.externalAccounts.filter(
          (account) => account.provider === "discord"
        ) ?? []
      const account = accounts[0]
      if (accounts.length !== 1 || !account)
        throw new Error("Connect one Discord identity in your account first.")
      const result = await account.reauthorize({
        additionalScopes: ["role_connections.write"],
        redirectUrl: `${window.location.origin}/discord/linked-role`,
      })
      const url = result.verification?.externalVerificationRedirectURL
      if (!url)
        throw new Error(
          "Discord did not return a consent URL. Reload to check the connection."
        )
      window.location.assign(url.href)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : failure)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      {connection ? (
        <p className="text-sm text-muted-foreground">
          {connection.provider === "clerk"
            ? "Connected through your Clerk Discord account."
            : "Connected through separate Discord verification."}{" "}
          {connection.metadataPublished
            ? "Metadata has been published to Discord."
            : "Metadata publication is pending."}
        </p>
      ) : null}
      <p role="status" className="text-sm text-muted-foreground">
        {error || Boolean(code) !== Boolean(state) ? failure : notice}
      </p>
      {consentRequired ? (
        <Button disabled={busy} onClick={authorize}>
          Allow Discord Linked Roles
        </Button>
      ) : null}
      {applicationMismatch ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              window.location.assign(await begin({}))
            } catch {
              setNotice(failure)
            } finally {
              setBusy(false)
            }
          }}
        >
          Use separate Discord verification
        </Button>
      ) : null}
    </div>
  )
}

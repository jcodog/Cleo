"use client"
import { useEffect, useRef, useState } from "react"
import { useAction } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
const failure =
  "Discord verification failed. Start again from Discord with the account linked to Cleo."
/** Discord's verification URL starts OAuth; its callback consumes the single-use state once. */
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
  const handled = useRef(false)
  const [notice, setNotice] = useState("Verifying your Discord connection...")
  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const callback = Boolean(code || state || error)
    if (callback) window.history.replaceState(null, "", "/discord/linked-role")
    if (error || (callback && (!code || !state))) {
      return
    }
    if (code && state) {
      void finish({ code, state }).then(
        () =>
          setNotice(
            "Discord Linked Roles verified. Return to Discord to claim eligible roles."
          ),
        () => setNotice(failure)
      )
    } else {
      void begin({}).then(
        (url) => window.location.assign(url),
        () => setNotice(failure)
      )
    }
  }, [begin, finish, code, state, error])
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {error || Boolean(code) !== Boolean(state) ? failure : notice}
    </p>
  )
}

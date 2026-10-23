"use client"
import { useAction, useQuery } from "convex/react"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { api } from "@workspace/backend/convex/_generated/api.js"
import {
  CLEO_COMMUNITY_ROLES,
  CLEO_ROLE_FAQ,
} from "@workspace/shared/cleoRoleEligibility"
import { Button } from "@workspace/ui/components/button"
export function AccountRoles({
  code,
  state,
}: {
  code?: string
  state?: string
}) {
  const roles = useQuery(api.communityRoles.current)
  const install = useAction(api.communityActions.installAccount)
  const begin = useAction(api.communityActions.beginLinkedRoles)
  const finish = useAction(api.communityActions.finishLinkedRoles)
  const refresh = useAction(api.communityActions.refreshEligibility)
  const disconnect = useAction(api.communityActions.disconnectLinkedRoles)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const handled = useRef(false)
  useEffect(() => {
    if (!code || !state || handled.current) return
    handled.current = true
    void finish({ code, state })
      .then(() => {
        setNotice(
          "Discord Linked Roles verified. Claim eligible roles in Discord."
        )
        window.history.replaceState(null, "", "/discord/linked-role")
      })
      .catch(() =>
        setNotice(
          "Discord verification failed. Start again with the Discord account linked to Cleo."
        )
      )
  }, [code, state, finish])
  async function act(operation: () => Promise<unknown>) {
    setBusy(true)
    setNotice("")
    try {
      const result = await operation()
      if (typeof result === "string") window.location.assign(result)
      else setNotice("Verification updated.")
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : "This capability is unavailable."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Community roles describe independent servers. They never grant
        ownership, staff status or permissions in Cleo's official Discord
        server.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => act(() => install({}))}>
          Add Cleo to my Discord account
        </Button>
        <Button
          variant="outline"
          render={<Link href="/dashboard/add-server" />}
        >
          Add Cleo to a Discord server
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => act(() => refresh({}))}
        >
          Refresh verification
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => act(() => begin({}))}
        >
          Connect Discord Linked Roles
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => act(() => disconnect({}))}
        >
          Disconnect Linked Roles
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      <dl className="divide-y">
        {CLEO_COMMUNITY_ROLES.map((role) => (
          <div className="flex justify-between gap-4 py-3 text-sm" key={role}>
            <dt>
              {role
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (c) => c.toUpperCase())}
            </dt>
            <dd>
              {roles === undefined
                ? "Loading…"
                : roles === null
                  ? "Verification needed"
                  : {
                      eligible: "Eligible",
                      notEligible: "Not eligible",
                      verificationNeeded: "Verification needed",
                      unavailable: "Unavailable",
                    }[roles[role]]}
            </dd>
          </div>
        ))}
      </dl>
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Linked roles FAQ</h2>
        {CLEO_ROLE_FAQ.split("\n\n")
          .slice(1)
          .map((paragraph) => (
            <p className="text-sm text-muted-foreground" key={paragraph}>
              {paragraph}
            </p>
          ))}
      </section>
    </div>
  )
}

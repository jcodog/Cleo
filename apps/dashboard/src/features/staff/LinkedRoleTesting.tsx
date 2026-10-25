"use client"

import { useState } from "react"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import type { Id } from "@workspace/backend/convex/_generated/dataModel.js"
import {
  CLEO_COMMUNITY_ROLES,
  type CleoCommunityRole,
} from "@workspace/shared/cleoRoleEligibility"
import { Button } from "@workspace/ui/components/button"

const label = (role: string) =>
  role.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())

export function LinkedRoleTesting() {
  const allowed = useQuery(api.communityRoleTesting.access)
  const users = usePaginatedQuery(
    api.communityRoleTesting.users,
    allowed ? {} : "skip",
    { initialNumItems: 50 }
  )
  const [userId, setUserId] = useState<Id<"users"> | null>(null)
  const grant = useQuery(
    api.communityRoleTesting.current,
    allowed && userId ? { userId } : "skip"
  )
  const save = useMutation(api.communityRoleTesting.set)
  const [roles, setRoles] = useState<CleoCommunityRole[]>([])
  const [hours, setHours] = useState(1)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  if (allowed === undefined)
    return <p role="status">Checking admin access...</p>
  if (!allowed) return <p>Admin access is required to test Linked Roles.</p>
  async function apply(selected: CleoCommunityRole[]) {
    if (!userId) return
    setBusy(true)
    setNotice("")
    try {
      await save({ userId, roles: selected, hours, reason })
      setNotice(
        selected.length
          ? "Test qualifications saved. Claim native Linked Roles in Discord. Existing role delivery gates still apply."
          : "Test qualifications removed. Normal eligibility applies."
      )
    } catch {
      setNotice(
        "Could not save. Check the linked Discord account, reason and duration, then retry."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <header className="space-y-2 border-b pb-5">
        <h1 className="font-heading text-2xl font-medium">
          Linked Roles testing
        </h1>
        <p className="text-sm text-muted-foreground">
          Temporary, audited qualifications for permission-free Discord roles.
          These do not grant subscriptions, billing access or server
          permissions, and never send announcements. Grants expire within 24
          hours.
        </p>
      </header>
      <div className="space-y-4">
        <label className="grid gap-2 text-sm">
          User
          <select
            className="w-full rounded-md border bg-background p-2"
            value={userId ?? ""}
            onChange={(event) => {
              setUserId((event.target.value as Id<"users">) || null)
              setNotice("")
              setRoles([])
            }}
          >
            <option value="">Select a user</option>
            {users.results.map((user) => (
              <option key={user.id} value={user.id} disabled={user.disabled}>
                {user.name}
                {user.disabled ? " (disabled)" : ""}
              </option>
            ))}
          </select>
        </label>
        {users.status === "CanLoadMore" ? (
          <Button variant="outline" onClick={() => users.loadMore(50)}>
            Load more users
          </Button>
        ) : null}
        {grant ? (
          <p className="text-sm text-muted-foreground">
            Current test grant: {grant.roles.map(label).join(", ")}. Expires{" "}
            {new Date(grant.expiresAt).toLocaleString()}. Reason: {grant.reason}
          </p>
        ) : null}
        <fieldset disabled={busy || !userId} className="space-y-3">
          <legend className="mb-3 text-sm font-medium">
            Test qualifications
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {CLEO_COMMUNITY_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={(event) =>
                    setRoles((previous) =>
                      event.target.checked
                        ? [...previous, role]
                        : previous.filter((value) => value !== role)
                    )
                  }
                />
                {label(role)}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setRoles([...CLEO_COMMUNITY_ROLES])}
          >
            Select all qualifications
          </Button>
          <label className="grid gap-2 text-sm">
            Expires after (hours)
            <input
              className="w-24 rounded-md border bg-background p-2"
              type="number"
              min={1}
              max={24}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Reason
            <input
              className="rounded-md border bg-background p-2"
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Verify role setup"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!roles.length || !reason.trim()}
              onClick={() => apply(roles)}
            >
              Grant test qualifications
            </Button>
            <Button
              variant="outline"
              disabled={!reason.trim()}
              onClick={() => apply([])}
            >
              Remove test qualifications
            </Button>
          </div>
        </fieldset>
      </div>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
    </main>
  )
}

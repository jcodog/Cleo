import React, { StrictMode, useState, useSyncExternalStore } from "react"
import { resolveCleoRoleEligibility } from "@workspace/shared/cleoRoleEligibility"
import { AccountRoles } from "../../src/features/community/AccountRoles"
import { PremiumPurchases } from "../../src/features/community/PremiumPurchases"

const params = new URLSearchParams(location.search)
export const communityFixtureMode = params.has("community")
const calls: { path: string; args: unknown }[] = []
const observers = new Set<() => void>()
let purchaseView = {
  configured: true,
  canManageOwnBilling: true,
  communityPublishIdentity: false,
  subscriptions: params.has("existing")
    ? [
        {
          id: "paid-fixture",
          announce: false,
          displayRole: false,
          active: true,
          testMode: false,
        },
      ]
    : [],
}
export function communityQuery(path: string) {
  if (path === "premiumPurchases:view") return purchaseView
  if (path === "communityRoles:current")
    return resolveCleoRoleEligibility({
      now: Date.now(),
      verifiedAccount: true,
      communities: [],
      twitchActive: false,
      paidSupporter: false,
    })
  throw new Error(`Unexpected community query ${path}`)
}
export async function communityWrite(
  path: string,
  args: unknown,
  notify: () => void
) {
  calls.push({ path, args })
  observers.forEach((callback) => callback())
  if (path === "communityActions:finishLinkedRoles") {
    if (params.has("wrongAccount"))
      throw new Error("Wrong linked Discord identity")
    return null
  }
  if (path === "premiumPurchases:preferences") {
    if (params.has("failPreferences")) throw new Error("Preference save failed")
    const input = args as {
      activationId: string
      announce: boolean
      displayRole: boolean
    }
    purchaseView = {
      ...purchaseView,
      subscriptions: purchaseView.subscriptions.map((p) =>
        p.id === input.activationId
          ? { ...p, announce: input.announce, displayRole: input.displayRole }
          : p
      ),
    }
  } else if (path === "premiumActions:setCommunityConsent") {
    if (params.has("failConsent"))
      throw new Error("Community consent save failed")
    purchaseView = {
      ...purchaseView,
      communityPublishIdentity: (args as { publishIdentity: boolean })
        .publishIdentity,
    }
  } else if (path !== "premiumActions:checkout")
    throw new Error(`Unexpected community operation ${path}`)
  notify()
  observers.forEach((callback) => callback())
  return null
}
export function CommunityFixture() {
  const [revision, setRevision] = useState(0)
  const operations = useSyncExternalStore(
    (callback) => {
      observers.add(callback)
      return () => {
        observers.delete(callback)
      }
    },
    () => JSON.stringify(calls)
  )
  return (
    <main>
      <StrictMode>
        <AccountRoles
          code={params.get("code") ?? undefined}
          state={params.get("state") ?? undefined}
          error={params.get("error") ?? undefined}
        />
        <PremiumPurchases discordGuildId="333333333333333333" />
      </StrictMode>
      <button onClick={() => setRevision((value) => value + 1)}>
        Rerender fixture {revision}
      </button>
      <output data-testid="community-calls">{operations}</output>
      <output data-testid="community-view">
        {JSON.stringify(purchaseView)}
      </output>
    </main>
  )
}

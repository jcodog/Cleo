"use client"
import { useAction, useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { Field, FieldLabel } from "@workspace/ui/components/field"
export function PremiumPurchases({
  discordGuildId,
}: {
  discordGuildId?: string
}) {
  const view = useQuery(api.premiumPurchases.view, { discordGuildId })
  const checkout = useAction(api.premiumActions.checkout)
  const portal = useAction(api.premiumActions.portal)
  const communityConsent = useAction(api.premiumActions.setCommunityConsent)
  const preferences = useMutation(api.premiumPurchases.preferences)
  const [announce, setAnnounce] = useState(false)
  const [displayRole, setDisplayRole] = useState(false)
  const [publishIdentity, setPublishIdentity] = useState<boolean | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  async function perform(operation: () => Promise<unknown>) {
    setBusy(true)
    setNotice("")
    try {
      const result = await operation()
      if (typeof result === "string") window.location.assign(result)
      else setNotice("Preferences saved.")
    } catch (failure) {
      setNotice(
        failure instanceof Error ? failure.message : "Billing is unavailable."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-5">
      <h2 className="font-heading text-lg font-medium">Community Premium</h2>
      <p className="text-sm text-muted-foreground">
        Premium belongs to the selected server. Your subscription never changes
        server ownership or administrative access. Billing management remains
        available for your own purchases if your server permissions change.
      </p>
      {!view?.configured ? (
        <p className="text-sm">
          Purchasing is unavailable until the operator configures and verifies
          test-mode billing. Live charging is disabled.
        </p>
      ) : null}
      {discordGuildId ? (
        <>
          <Field orientation="horizontal">
            <Switch
              checked={announce}
              onCheckedChange={setAnnounce}
              aria-label="Announce support"
            />
            <FieldLabel>Announce that I supported this community</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch
              checked={displayRole}
              onCheckedChange={setDisplayRole}
              aria-label="Display Supporter role"
            />
            <FieldLabel>Display my Premium Supporter role</FieldLabel>
          </Field>
          <p className="text-sm text-muted-foreground">
            Both are optional. Announcements also require community consent to
            publish its identity. Test payments do not grant public Supporter
            recognition.
          </p>
          <Button
            disabled={busy || !view?.configured}
            onClick={() =>
              perform(() => checkout({ discordGuildId, announce, displayRole }))
            }
          >
            Continue to Stripe Checkout
          </Button>
          <Field orientation="horizontal">
            <Switch
              checked={
                publishIdentity ?? view?.communityPublishIdentity ?? false
              }
              onCheckedChange={setPublishIdentity}
              aria-label="Community identity consent"
            />
            <FieldLabel>
              Allow this community's identity in public upgrade announcements
            </FieldLabel>
          </Field>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              perform(() =>
                communityConsent({
                  discordGuildId,
                  publishIdentity:
                    publishIdentity ?? view?.communityPublishIdentity ?? false,
                })
              )
            }
          >
            Save community publication consent
          </Button>
        </>
      ) : null}
      <Button
        variant="outline"
        disabled={busy || !view?.canManageOwnBilling || !view.configured}
        onClick={() => perform(() => portal({}))}
      >
        Manage my Stripe billing
      </Button>
      {view?.subscriptions.map((purchase) => (
        <div className="space-y-3 border-t pt-4" key={purchase.id}>
          <p className="text-sm">
            {purchase.testMode ? "Test subscription" : "Community subscription"}
            : {purchase.active ? "Active paid coverage" : "Inactive coverage"}
          </p>
          <Field orientation="horizontal">
            <Switch
              aria-label="Purchase announcement consent"
              checked={purchase.announce}
              disabled={busy}
              onCheckedChange={(value) =>
                perform(() =>
                  preferences({
                    activationId: purchase.id,
                    announce: value,
                    displayRole: purchase.displayRole,
                  })
                )
              }
            />
            <FieldLabel>Public announcement consent</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch
              aria-label="Supporter role visibility"
              checked={purchase.displayRole}
              disabled={busy}
              onCheckedChange={(value) =>
                perform(() =>
                  preferences({
                    activationId: purchase.id,
                    announce: purchase.announce,
                    displayRole: value,
                  })
                )
              }
            />
            <FieldLabel>Supporter role visibility</FieldLabel>
          </Field>
        </div>
      ))}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

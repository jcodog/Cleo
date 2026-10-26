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
    <section className="w-full min-w-0 space-y-9">
      <header className="space-y-3 border-b pb-7">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {discordGuildId ? "Cleo for communities" : "Cleo account"}
        </p>
        <h2 className="font-heading text-2xl font-medium tracking-tight">
          {discordGuildId ? "Premium Guild" : "My billing"}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {discordGuildId
            ? "Premium is attached to this community, not to its owner's account. Supporting a community never changes ownership or grants server permissions."
            : "Manage your own purchases and billing preferences, including after you leave a community."}
        </p>
        {!view?.configured ? (
          <p role="status" className="text-sm text-muted-foreground">
            Test-mode purchasing is unavailable until billing is configured.
            Live charging is not enabled.
          </p>
        ) : null}
      </header>

      {discordGuildId ? (
        <>
          <div className="grid items-start gap-10 border-b pb-9 md:grid-cols-2">
            <section className="space-y-4" aria-labelledby="guild-upgrade">
              <div className="space-y-2">
                <h3 id="guild-upgrade" className="font-heading text-lg font-medium">
                  Support this community
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Checkout is hosted by Stripe. A paid plan does not transfer
                  ownership or management permissions.
                </p>
              </div>
              <Button
                disabled={busy || !view?.configured}
                onClick={() =>
                  perform(() =>
                    checkout({ discordGuildId, announce, displayRole })
                  )
                }
              >
                Continue to Stripe Checkout
              </Button>
            </section>
            <section className="space-y-5" aria-labelledby="guild-visibility">
              <div className="space-y-2">
                <h3 id="guild-visibility" className="font-heading text-lg font-medium">
                  Your recognition choices
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Both options are private by default. Test payments cannot
                  trigger public recognition.
                </p>
              </div>
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
            </section>
          </div>
          <section className="space-y-4 border-b pb-9" aria-labelledby="guild-consent">
            <div className="space-y-2">
              <h3 id="guild-consent" className="font-heading text-lg font-medium">
                Community publication preferences
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                A purchase announcement also requires consent to identify this
                community publicly. This is independent of the buyer's own consent.
              </p>
            </div>
            <Field orientation="horizontal">
              <Switch
                checked={
                  publishIdentity ?? view?.communityPublishIdentity ?? false
                }
                onCheckedChange={setPublishIdentity}
                aria-label="Community identity consent"
              />
              <FieldLabel>
                Allow the community's identity in public upgrade announcements
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
          </section>
        </>
      ) : null}

      <section className="space-y-5" aria-labelledby="personal-billing">
        <div className="space-y-2">
          <h3 id="personal-billing" className="font-heading text-lg font-medium">
            Your subscriptions
          </h3>
          <p className="text-sm text-muted-foreground">
            Billing management belongs to the purchaser, even if their
            permissions in a server change.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy || !view?.canManageOwnBilling || !view?.configured}
          onClick={() => perform(() => portal({}))}
        >
          Manage my Stripe billing
        </Button>
        {view?.subscriptions.map((purchase) => (
          <div className="space-y-4 border-t pt-5" key={purchase.id}>
            <p className="text-sm font-medium">
              {purchase.testMode ? "Test subscription" : "Community subscription"}
              {" · "}
              {purchase.active ? "Active paid coverage" : "Inactive coverage"}
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
      </section>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

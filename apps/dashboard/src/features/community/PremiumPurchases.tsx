"use client"
import { useAction, useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import type { FunctionReturnType } from "convex/server"
import { dashboardEnv } from "@workspace/env/dashboard"
import { PremiumCheckout } from "./PremiumCheckout"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import Link from "next/link"
/** Separate guild entitlements from purchaser billing and wait for resolved billing state. */
export function PremiumPurchases({
  discordGuildId,
}: {
  discordGuildId?: string
}) {
  const { isLoaded, userId, sessionId } = useAuth()
  if (!isLoaded || !userId) return <p role="status">Loading billing account…</p>
  return (
    <PremiumPurchasesContent
      key={`${userId}:${sessionId}:${discordGuildId ?? "personal"}`}
      discordGuildId={discordGuildId}
    />
  )
}

function PremiumPurchasesContent({
  discordGuildId,
}: {
  discordGuildId?: string
}) {
  const view = useQuery(api.premiumPurchases.view, { discordGuildId })
  const checkout = useAction(api.premiumActions.checkout)
  const cancelCheckout = useAction(api.premiumActions.cancelCheckout)
  const portal = useAction(api.premiumActions.portal)
  const communityConsent = useAction(api.premiumActions.setCommunityConsent)
  const preferences = useMutation(api.premiumPurchases.preferences)
  const [announce, setAnnounce] = useState(false)
  const [displayRole, setDisplayRole] = useState(false)
  const [publishIdentity, setPublishIdentity] = useState<boolean | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<FunctionReturnType<
    typeof api.premiumActions.checkout
  > | null>(null)
  const checkoutAnnounce = view?.pendingCheckout?.announce ?? announce
  const checkoutDisplayRole = view?.pendingCheckout?.displayRole ?? displayRole
  const paymentFormConfigured =
    dashboardEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") ===
    true
  async function beginCheckout() {
    if (!discordGuildId || busy) return
    setBusy(true)
    setNotice("")
    try {
      setSession(
        await checkout({
          discordGuildId,
          announce: checkoutAnnounce,
          displayRole: checkoutDisplayRole,
        })
      )
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : "Checkout is unavailable. Try again."
      )
    } finally {
      setBusy(false)
    }
  }
  /** Report billing progress and provider failures without clearing saved preferences. */
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
  if (view === undefined)
    return (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        Loading Premium details…
      </p>
    )
  if (session && discordGuildId)
    return (
      <PremiumCheckout
        session={session}
        discordGuildId={discordGuildId}
        announce={checkoutAnnounce}
        displayRole={checkoutDisplayRole}
        onCancel={() => setSession(null)}
      />
    )
  return (
    <section className="w-full min-w-0 space-y-9">
      <header className="space-y-3 border-b pb-7">
        <h2 className="font-heading text-2xl font-medium tracking-tight">
          {discordGuildId ? "Server subscription" : "My billing"}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {discordGuildId
            ? "Premium is attached to this community, not to its owner's account. Supporting a community never changes ownership or grants server permissions."
            : "Manage your own purchases and billing preferences, including after you leave a community."}
        </p>
        {view !== undefined && !view.configured ? (
          <p role="status" className="text-sm text-muted-foreground">
            Test-mode purchasing is unavailable until billing is configured.
            Live charging is not enabled.
          </p>
        ) : null}
      </header>

      {discordGuildId ? (
        <>
          {view.guildPremium ? (
            <section className="space-y-4" aria-label="Premium entitlement">
              <dl className="grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Premium status
                  </dt>
                  <dd className="mt-1 font-medium capitalize">
                    {view.guildPremium.capabilities.length === 0
                      ? "No active Premium"
                      : view.guildPremium.state === "grace"
                        ? "Payment grace period"
                        : view.guildPremium.state}
                  </dd>
                </div>
                {view.guildPremium.capabilities.length > 0 ? (
                  <div>
                    <dt className="text-sm text-muted-foreground">
                      Coverage until
                    </dt>
                    <dd className="mt-1 font-medium">
                      {new Date(
                        view.guildPremium.validUntil
                      ).toLocaleDateString()}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <ul className="divide-y border-y text-sm">
                {[
                  [
                    "guild.welcome.premium-style",
                    "Premium welcome card styles",
                  ],
                  [
                    "guild.twitch.premium-style",
                    "Premium Twitch notification styles",
                  ],
                ].map(([capability, label]) => (
                  <li
                    key={capability}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <span>{label}</span>
                    <span className="text-muted-foreground">
                      {capability &&
                      view.guildPremium?.capabilities.includes(capability)
                        ? "Available"
                        : "Requires Premium"}
                    </span>
                  </li>
                ))}
              </ul>
              {!view.guildPremium.canPurchase ? (
                <p className="text-sm text-muted-foreground">
                  Purchasing requires the server owner or an Administrator in an
                  independent server with Cleo installed.
                </p>
              ) : null}
            </section>
          ) : null}
          <div className="grid items-start gap-10 border-b pb-9 md:grid-cols-2">
            <section className="space-y-4" aria-labelledby="guild-upgrade">
              <div className="space-y-2">
                <h3
                  id="guild-upgrade"
                  className="font-heading text-lg font-medium"
                >
                  Support this community
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Review your plan and pay securely in Cleo. A paid plan does
                  not transfer ownership or management permissions.
                </p>
              </div>
              <Button
                disabled={
                  busy ||
                  !view.configured ||
                  !paymentFormConfigured ||
                  !view.guildPremium?.canPurchase
                }
                onClick={beginCheckout}
              >
                {view.pendingCheckout
                  ? "Resume checkout"
                  : "Continue to checkout"}
              </Button>
              {view.pendingCheckout?.sessionId ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !discordGuildId ||
                      !view.pendingCheckout?.sessionId ||
                      busy
                    )
                      return
                    setBusy(true)
                    setNotice("")
                    try {
                      const result = await cancelCheckout({
                        discordGuildId,
                        sessionId: view.pendingCheckout.sessionId,
                      })
                      setNotice(
                        result === "complete"
                          ? "This checkout has completed. Check My billing for its payment status."
                          : "Checkout cancelled."
                      )
                    } catch {
                      setNotice(
                        "We could not cancel this checkout. Check My billing before starting another payment."
                      )
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Cancel existing checkout
                </Button>
              ) : null}
              {view.configured ? (
                <p className="text-xs text-muted-foreground">
                  Checkout runs in Stripe test mode.
                </p>
              ) : null}
              {view.configured && !paymentFormConfigured ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Secure test payments are not configured for this dashboard.
                </p>
              ) : null}
            </section>
            <section className="space-y-5" aria-labelledby="guild-visibility">
              <div className="space-y-2">
                <h3
                  id="guild-visibility"
                  className="font-heading text-lg font-medium"
                >
                  Your recognition choices
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Both options are private by default. Test payments cannot
                  trigger public recognition.
                </p>
              </div>
              <Field orientation="horizontal">
                <Switch
                  checked={checkoutAnnounce}
                  disabled={!!view.pendingCheckout}
                  id="premium-announce"
                  onCheckedChange={setAnnounce}
                  aria-label="Announce support"
                />
                <FieldLabel htmlFor="premium-announce">
                  Announce that I supported this community
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Switch
                  checked={checkoutDisplayRole}
                  disabled={!!view.pendingCheckout}
                  id="premium-supporter"
                  onCheckedChange={setDisplayRole}
                  aria-label="Display Supporter role"
                />
                <FieldLabel htmlFor="premium-supporter">
                  Display my Premium Supporter role
                </FieldLabel>
              </Field>
              {view.pendingCheckout ? (
                <p className="text-xs text-muted-foreground">
                  Your existing checkout keeps these choices. Cancel it to
                  change them.
                </p>
              ) : null}
            </section>
          </div>
          <section
            className="space-y-4 border-b pb-9"
            aria-labelledby="guild-consent"
          >
            <div className="space-y-2">
              <h3
                id="guild-consent"
                className="font-heading text-lg font-medium"
              >
                Community publication preferences
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                A purchase announcement also requires consent to identify this
                community publicly. This is independent of the buyer's own
                consent.
              </p>
            </div>
            <Field orientation="horizontal">
              <Switch
                checked={
                  publishIdentity ?? view?.communityPublishIdentity ?? false
                }
                onCheckedChange={setPublishIdentity}
                aria-label="Community identity consent"
                id="premium-community-consent"
              />
              <FieldLabel htmlFor="premium-community-consent">
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
                      publishIdentity ??
                      view?.communityPublishIdentity ??
                      false,
                  })
                )
              }
            >
              Save community publication consent
            </Button>
          </section>
        </>
      ) : null}

      {discordGuildId ? (
        <p className="text-sm text-muted-foreground">
          The purchaser manages payment methods and subscriptions in{" "}
          <Link
            href="/account/billing"
            className="text-primary underline underline-offset-4"
          >
            My billing
          </Link>
          .
        </p>
      ) : (
        <section className="space-y-5" aria-labelledby="personal-billing">
          <div className="space-y-2">
            <h3
              id="personal-billing"
              className="font-heading text-lg font-medium"
            >
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
                {purchase.testMode
                  ? "Test subscription"
                  : "Community subscription"}
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
      )}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

"use client"

import { useAuth } from "@clerk/nextjs"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useState } from "react"
import Link from "next/link"
import { formatStripeAmount } from "@/features/community/formatStripeAmount"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"

export function PersonalBilling() {
  const { userId, sessionId, isLoaded } = useAuth()
  const { isAuthenticated, isLoading } = useConvexAuth()
  if (!isLoaded || !userId) return <p role="status">Loading billing account…</p>
  if (isLoading) return <p role="status">Connecting your billing account…</p>
  if (!isAuthenticated)
    return (
      <p role="alert">
        Your Clerk session has not connected to Convex. Sign in again to load
        your subscriptions.
      </p>
    )
  return <Billing key={`${userId}:${sessionId}`} clerkUserId={userId} />
}

function Billing({ clerkUserId }: { clerkUserId: string }) {
  const ledger = useQuery(api.accountBilling.overview, {})
  const loadPrices = useAction(api.accountBillingActions.prices)
  const portal = useAction(api.premiumActions.portal)
  const preferences = useMutation(api.premiumPurchases.preferences)
  const [commercial, setCommercial] = useState<FunctionReturnType<
    typeof api.accountBillingActions.prices
  > | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const priceKey =
    ledger?.clerkUserId === clerkUserId
      ? ledger.subscriptions.map((row) => row.priceId).join(":")
      : ""
  useEffect(() => {
    if (!priceKey) return
    let active = true
    void loadPrices({})
      .then((prices) => {
        if (active) setCommercial(prices)
      })
      .catch(() => {
        if (active)
          setNotice(
            "Plan pricing is temporarily unavailable. Your invoices remain available in billing management."
          )
      })
    return () => {
      active = false
    }
  }, [loadPrices, priceKey])
  async function run(operation: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setNotice("")
    try {
      await operation()
    } catch (failure) {
      setNotice(
        failure instanceof ConvexError && typeof failure.data === "string"
          ? failure.data
          : "Billing management failed. Check the connected Convex deployment and Stripe Customer Portal configuration, then retry."
      )
    } finally {
      setBusy(false)
    }
  }
  if (!ledger || ledger.clerkUserId !== clerkUserId)
    return <p role="status">Loading your subscriptions…</p>
  return (
    <section className="mx-auto w-full max-w-4xl space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="max-w-xl space-y-2">
          <h1 className="font-heading text-2xl font-medium">
            Billing and subscriptions
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Your purchases stay here even after you leave a community. Manage
            payment methods, invoices and cancellation through Stripe.
          </p>
        </div>
        {ledger.canManageBilling ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                window.location.assign(await portal({}))
              })
            }
          >
            Manage billing
          </Button>
        ) : null}
      </header>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {ledger.configuration ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Billing connection details
          </summary>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="inline font-medium">Stripe mode: </dt>
              <dd className="inline">{ledger.configuration.stripeMode}</dd>
            </div>
            <div>
              <dt className="inline font-medium">New test checkout: </dt>
              <dd className="inline">
                {ledger.configuration.checkoutEnabled ? "enabled" : "disabled"}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Return origin: </dt>
              <dd className="inline break-all">
                {ledger.configuration.returnOrigin ??
                  "CLEO_DASHBOARD_ORIGIN is missing"}
              </dd>
            </div>
            {ledger.configuration.missing.length ? (
              <div>
                <dt className="font-medium">Missing Convex configuration</dt>
                <dd className="break-words">
                  {ledger.configuration.missing.join(", ")}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-muted-foreground">
            Configuration presence does not verify the Stripe account, webhook
            delivery or payment acceptance. Your subscription history remains
            available while checkout is disabled.
          </p>
        </details>
      ) : null}
      {!ledger.canManageBilling && ledger.subscriptions.length ? (
        <p className="text-sm text-muted-foreground">
          Billing management is currently unavailable. Contact Cleo support if
          you need help with an existing subscription.
        </p>
      ) : null}
      {ledger.subscriptions.length === 0 ? (
        <div className="space-y-3 py-5">
          <h2 className="font-heading text-lg font-medium">
            No subscriptions yet
          </h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Community Premium purchases made with this account will appear here
            after payment verification.
          </p>
          <Button
            nativeButton={false}
            render={<Link href="/dashboard/servers" />}
          >
            View your servers
          </Button>
        </div>
      ) : (
        <div className="divide-y border-b">
          {ledger.subscriptions.map((subscription) => {
            const price = commercial?.find(
              (entry) => entry.id === subscription.priceId
            )
            const period = price?.interval
              ? price.intervalCount === 1
                ? price.interval
                : `${price.intervalCount} ${price.interval}s`
              : null
            const recognition = subscription.recognition
            return (
              <article
                key={subscription.id}
                className="space-y-5 py-6 first:pt-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="font-heading text-lg font-medium">
                      {subscription.guildName ?? "Community unavailable"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {price?.name ?? "Plan information unavailable"}
                      {price?.amount !== null && price?.amount !== undefined
                        ? ` · ${formatStripeAmount(price.amount, price.currency)}${period ? ` / ${period}` : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-sm capitalize">
                    {subscription.status.replaceAll("_", " ")}
                    {recognition?.testMode ? " · Test subscription" : ""}
                  </span>
                </div>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      {subscription.cancelAtPeriodEnd
                        ? "Scheduled to end"
                        : subscription.status === "active" ||
                            subscription.status === "trialing"
                          ? "Current billing period ends"
                          : "Last billing period ended"}
                    </dt>
                    <dd className="mt-1">
                      {new Date(subscription.endsAt).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last verified</dt>
                    <dd className="mt-1">
                      {new Date(subscription.reconciledAt).toLocaleString()}
                    </dd>
                  </div>
                </dl>
                {subscription.paymentFailedAt ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    A payment failed. Review your payment method and invoice in
                    billing management.
                  </p>
                ) : null}
                {recognition ? (
                  <fieldset disabled={busy} className="space-y-3">
                    <legend className="mb-3 text-sm font-medium">
                      Your recognition preferences
                    </legend>
                    <label className="flex items-center gap-3 text-sm">
                      <Switch
                        checked={recognition.announce}
                        aria-label={`Announce support for ${subscription.guildName ?? "community"}`}
                        onCheckedChange={(value) =>
                          run(() =>
                            preferences({
                              activationId: recognition.id,
                              announce: value,
                              displayRole: recognition.displayRole,
                            })
                          )
                        }
                      />
                      Announce my support
                    </label>
                    <label className="flex items-center gap-3 text-sm">
                      <Switch
                        checked={recognition.displayRole}
                        aria-label={`Supporter role for ${subscription.guildName ?? "community"}`}
                        onCheckedChange={(value) =>
                          run(() =>
                            preferences({
                              activationId: recognition.id,
                              announce: recognition.announce,
                              displayRole: value,
                            })
                          )
                        }
                      />
                      Display my Supporter role
                    </label>
                    {recognition.testMode ? (
                      <p className="text-xs text-muted-foreground">
                        Test subscriptions do not publish recognition.
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
      {ledger.hasMore ? (
        <p className="text-sm text-muted-foreground">
          Showing your 20 most recent subscriptions. Open billing management for
          all invoices and payment records.
        </p>
      ) : null}
    </section>
  )
}

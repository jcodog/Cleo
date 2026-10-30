"use client"

import { useAuth } from "@clerk/nextjs"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useEffect, useState } from "react"
import Link from "next/link"
import { formatStripeAmount } from "@/features/community/formatStripeAmount"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import {
  PaymentDetails,
  BillingInvoices,
} from "@/features/billing/PaymentDetails"
import type { BillingProfile } from "@/features/billing/PaymentForms"

export function PersonalBilling() {
  const { userId, sessionId, isLoaded } = useAuth()
  const { isAuthenticated, isLoading } = useConvexAuth()
  if (!isLoaded || !userId) return <p role="status">Loading billing account…</p>
  if (isLoading) return <p role="status">Connecting your billing account…</p>
  if (!isAuthenticated)
    return (
      <p role="alert">
        Your account connection could not be verified. Sign in again to load
        your billing details.
      </p>
    )
  return <Billing key={`${userId}:${sessionId}`} clerkUserId={userId} />
}

function Billing({ clerkUserId }: { clerkUserId: string }) {
  const { sessionId } = useAuth()
  const ledger = useQuery(api.accountBilling.overview, {})
  const loadProfile = useAction(api.billingPortalActions.profile)
  const completeSetup = useAction(api.billingPortalActions.completeSetup)
  const portal = useAction(api.premiumActions.portal)
  const preferences = useMutation(api.premiumPurchases.preferences)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState<BillingProfile | null>(null)
  const [profileFailed, setProfileFailed] = useState(false)
  const [profileRevision, setProfileRevision] = useState(0)
  const [pendingSetup, setPendingSetup] = useState<string | null>(null)
  const storageKey = `cleo:billing-setup:${clerkUserId}:${sessionId}`
  function refreshProfile() {
    setProfileFailed(false)
    setProfileRevision((value) => value + 1)
  }
  function rememberSetup(id: string | null) {
    setPendingSetup(id)
    try {
      if (id) sessionStorage.setItem(storageKey, id)
      else sessionStorage.removeItem(storageKey)
    } catch {
      /* Storage is optional; every setup is re-authorised server-side. */
    }
  }
  useEffect(() => {
    let active = true
    void loadProfile({})
      .then((value) => {
        if (active && value.clerkUserId === clerkUserId) setProfile(value)
      })
      .catch(() => {
        if (active) setProfileFailed(true)
      })
    return () => {
      active = false
    }
  }, [loadProfile, clerkUserId, profileRevision])
  useEffect(() => {
    const url = new URL(window.location.href)
    let id = url.searchParams.get("setup_intent")
    if (url.searchParams.has("setup_intent_client_secret")) {
      for (const name of [
        "setup_intent",
        "setup_intent_client_secret",
        "redirect_status",
      ])
        url.searchParams.delete(name)
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`
      )
    }
    try {
      id ??= sessionStorage.getItem(storageKey)
    } catch {
      /* A redirect ID is sufficient without storage. */
    }
    if (!id || !/^seti_[A-Za-z0-9]+$/.test(id)) return
    let active = true
    const setupIntentId = id
    void completeSetup({ setupIntentId })
      .then((status) => {
        if (!active) return
        if (status === "saved") {
          try {
            sessionStorage.removeItem(storageKey)
          } catch {
            /* Optional storage. */
          }
          setPendingSetup(null)
          setNotice("Payment method saved as your default.")
          setProfileRevision((value) => value + 1)
        } else {
          setPendingSetup(setupIntentId)
          setNotice("Your bank is still confirming the payment method.")
        }
      })
      .catch(() => {
        if (active) {
          setPendingSetup(setupIntentId)
          setNotice(
            "Payment setup could not be confirmed. Check its status before trying again."
          )
        }
      })
    return () => {
      active = false
    }
  }, [clerkUserId, completeSetup, storageKey])
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
          : "Billing management could not be opened. Please try again or contact support."
      )
    } finally {
      setBusy(false)
    }
  }
  if (!ledger || ledger.clerkUserId !== clerkUserId)
    return <p role="status">Loading your subscriptions…</p>
  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 py-3 sm:py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <h1 className="font-heading text-2xl font-medium">
            Billing and subscriptions
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Manage your payment details, subscriptions and invoices.
          </p>
        </div>
        {ledger.canManageBilling &&
        (ledger.subscriptions.length > 0 || !!profile?.subscriptions.length) ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                window.location.assign(
                  await portal({ returnOrigin: window.location.origin })
                )
              })
            }
          >
            Manage subscriptions
          </Button>
        ) : null}
      </header>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      {pendingSetup ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const status = await completeSetup({
                setupIntentId: pendingSetup,
              })
              if (status === "saved") {
                rememberSetup(null)
                refreshProfile()
                setNotice("Payment method saved as your default.")
              } else
                setNotice("Your bank is still confirming the payment method.")
            })
          }
        >
          Check payment setup status
        </Button>
      ) : null}
      <PaymentDetails
        profile={profile}
        loading={!profile && !profileFailed}
        failed={profileFailed}
        onRefresh={refreshProfile}
        onNotice={setNotice}
        onSetupPending={rememberSetup}
        onManage={() =>
          void run(async () => {
            window.location.assign(
              await portal({ returnOrigin: window.location.origin })
            )
          })
        }
      />
      <section aria-labelledby="subscriptions-heading" className="space-y-5">
        <h2
          id="subscriptions-heading"
          className="font-heading text-lg font-medium"
        >
          Subscriptions
        </h2>
        {!ledger.canManageBilling && ledger.subscriptions.length ? (
          <p className="text-sm text-muted-foreground">
            Billing management is currently unavailable. Contact Cleo support if
            you need help with an existing subscription.
          </p>
        ) : null}
        {!profile && !profileFailed && ledger.subscriptions.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading subscriptions…
          </p>
        ) : profileFailed && ledger.subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Subscription details could not be loaded. Retry payment details
            above.
          </p>
        ) : ledger.subscriptions.length === 0 &&
          !profile?.subscriptions.length ? (
          <div className="space-y-3 pb-2">
            <h3 className="text-sm font-medium">No subscriptions yet</h3>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Community Premium purchases made with this account will appear
              here after payment verification.
            </p>
            <Button
              nativeButton={false}
              render={<Link href="/dashboard/servers" />}
            >
              View your servers
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {ledger.subscriptions.map((subscription) => {
              const stripeSubscription = profile?.subscriptions.find(
                (row) => row.id === subscription.stripeSubscriptionId
              )
              const price = stripeSubscription?.items[0]
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
                          ? ` · ${formatStripeAmount(price.amount * price.quantity, price.currency)}${period ? ` / ${period}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-sm capitalize">
                      {(
                        stripeSubscription?.status ?? subscription.status
                      ).replaceAll("_", " ")}
                      {recognition?.testMode ? " · Test subscription" : ""}
                    </span>
                  </div>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">
                        {(stripeSubscription?.cancelAtPeriodEnd ??
                        subscription.cancelAtPeriodEnd)
                          ? "Scheduled to end"
                          : subscription.status === "active" ||
                              subscription.status === "trialing"
                            ? "Current billing period ends"
                            : "Last billing period ended"}
                      </dt>
                      <dd className="mt-1">
                        {new Date(
                          stripeSubscription?.periodEnd ?? subscription.endsAt
                        ).toLocaleDateString()}
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
                      A payment failed. Review your payment method and invoice
                      in billing management.
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
        {profile?.subscriptions
          .filter(
            (row) =>
              !ledger.subscriptions.some(
                (record) => record.stripeSubscriptionId === row.id
              )
          )
          .map((subscription) => (
            <article key={subscription.id} className="space-y-3 pb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-medium">
                  {subscription.items[0]?.name ?? "Subscription"}
                </h3>
                <span className="text-sm capitalize">
                  {subscription.status.replaceAll("_", " ")}
                </span>
              </div>
              {subscription.items.map((item, index) => (
                <p key={index} className="text-sm text-muted-foreground">
                  {item.name} ·{" "}
                  {item.amount === null
                    ? "Usage-based pricing"
                    : formatStripeAmount(
                        item.amount * item.quantity,
                        item.currency
                      )}
                  {item.interval
                    ? ` / ${item.intervalCount === 1 ? item.interval : `${item.intervalCount} ${item.interval}s`}`
                    : ""}
                </p>
              ))}
              {subscription.periodEnd ? (
                <p className="text-sm">
                  {subscription.cancelAtPeriodEnd
                    ? "Scheduled to end"
                    : "Current period ends"}{" "}
                  {new Date(subscription.periodEnd).toLocaleDateString()}
                </p>
              ) : null}
            </article>
          ))}
        {ledger.hasMore || profile?.hasMoreSubscriptions ? (
          <p className="text-sm text-muted-foreground">
            More subscriptions are available in Stripe subscription management.
          </p>
        ) : null}
      </section>
      <BillingInvoices
        profile={profile}
        failed={profileFailed}
        onManage={() =>
          void run(async () => {
            window.location.assign(
              await portal({ returnOrigin: window.location.origin })
            )
          })
        }
      />
    </section>
  )
}

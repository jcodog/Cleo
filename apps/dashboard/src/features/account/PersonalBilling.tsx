"use client"

import { useAuth } from "@clerk/nextjs"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useEffect, useRef, useState } from "react"
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

export type BillingView = "subscriptions" | "payment-details" | "invoices"

export function PersonalBilling({
  view = "subscriptions",
}: {
  view?: BillingView
}) {
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
  return (
    <Billing key={`${userId}:${sessionId}`} clerkUserId={userId} view={view} />
  )
}

function Billing({
  clerkUserId,
  view,
}: {
  clerkUserId: string
  view: BillingView
}) {
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
  const currentSetup = useRef<string | null>(null)
  const storageKey = `cleo:billing-setup:${clerkUserId}:${sessionId}`
  function refreshProfile() {
    setProfileFailed(false)
    setProfileRevision((value) => value + 1)
  }
  function rememberSetup(id: string | null) {
    currentSetup.current = id
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
        if (value.clerkUserId !== clerkUserId)
          throw new Error("Billing profile identity mismatch")
        if (active) setProfile(value)
      })
      .catch(() => {
        if (active) {
          setProfile(null)
          setProfileFailed(true)
        }
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
    currentSetup.current = setupIntentId
    void completeSetup({ setupIntentId })
      .then((status) => {
        if (!active || currentSetup.current !== setupIntentId) return
        if (status === "saved" || status === "failed") {
          currentSetup.current = null
          try {
            sessionStorage.removeItem(storageKey)
          } catch {
            /* Optional storage. */
          }
          setPendingSetup(null)
          setNotice(
            status === "saved"
              ? "Payment method saved as your default."
              : "Payment setup was not completed. Please try again."
          )
          setProfileRevision((value) => value + 1)
        } else {
          setPendingSetup(setupIntentId)
          setNotice("Your bank is still confirming the payment method.")
        }
      })
      .catch(() => {
        if (active && currentSetup.current === setupIntentId) {
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
  function openPortal() {
    return run(async () => {
      const url = await portal({
        returnOrigin: window.location.origin,
        returnPath: view === "subscriptions" ? "/billing" : `/billing/${view}`,
      })
      window.location.assign(url)
    })
  }
  if (!ledger || ledger.clerkUserId !== clerkUserId)
    return <p role="status">Loading billing…</p>
  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 py-3 sm:py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <h1 className="font-heading text-2xl font-medium">
            {view === "subscriptions"
              ? "Subscriptions"
              : view === "payment-details"
                ? "Payment details"
                : "Invoices"}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {view === "subscriptions"
              ? "Manage your community Premium subscriptions."
              : view === "payment-details"
                ? "Manage your saved payment methods and billing address."
                : "View and download your invoices."}
          </p>
        </div>
        {view === "subscriptions" &&
        ledger.canManageBilling &&
        (ledger.subscriptions.length > 0 || !!profile?.subscriptions.length) ? (
          <Button variant="outline" disabled={busy} onClick={openPortal}>
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
              if (currentSetup.current !== pendingSetup) return
              if (status === "saved" || status === "failed") {
                rememberSetup(null)
                refreshProfile()
                setNotice(
                  status === "saved"
                    ? "Payment method saved as your default."
                    : "Payment setup was not completed. Please try again."
                )
              } else
                setNotice("Your bank is still confirming the payment method.")
            })
          }
        >
          Check payment setup status
        </Button>
      ) : null}
      {view === "payment-details" ? (
        <PaymentDetails
          profile={profile}
          loading={!profile && !profileFailed}
          failed={profileFailed}
          onRefresh={refreshProfile}
          onNotice={setNotice}
          onSetupPending={rememberSetup}
          onManage={openPortal}
        />
      ) : null}
      {view === "subscriptions" ? (
        <section aria-label="Subscriptions" className="space-y-5">
          {profileFailed ? (
            <Button variant="outline" onClick={refreshProfile}>
              Retry subscription details
            </Button>
          ) : null}
          {!ledger.canManageBilling && ledger.subscriptions.length ? (
            <p className="text-sm text-muted-foreground">
              Billing management is currently unavailable. Contact Cleo support
              if you need help with an existing subscription.
            </p>
          ) : null}
          {!profile && !profileFailed && ledger.subscriptions.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading subscriptions…
            </p>
          ) : profileFailed && ledger.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Subscription details could not be loaded. Please try again.
            </p>
          ) : ledger.subscriptions.length === 0 &&
            !profile?.subscriptions.length ? (
            <div className="space-y-3 pb-2">
              <h2 className="text-sm font-medium">No subscriptions yet</h2>
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
                        {stripeSubscription?.items.length ? (
                          stripeSubscription.items.map((price, index) => {
                            const period = price.interval
                              ? price.intervalCount === 1
                                ? price.interval
                                : `${price.intervalCount} ${price.interval}s`
                              : null
                            return (
                              <p
                                key={`${price.name}:${index}`}
                                className="text-sm text-muted-foreground"
                              >
                                {price.name}
                                {price.amount !== null
                                  ? ` · ${formatStripeAmount(price.amount * price.quantity, price.currency)}${period ? ` / ${period}` : ""}`
                                  : ""}
                              </p>
                            )
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Plan information unavailable
                          </p>
                        )}
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
                  <h2 className="font-medium">
                    {subscription.items[0]?.name ?? "Subscription"}
                  </h2>
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
              More subscriptions are available in Stripe subscription
              management.
            </p>
          ) : null}
        </section>
      ) : null}
      {view === "invoices" ? (
        <>
          {profileFailed ? (
            <Button variant="outline" onClick={refreshProfile}>
              Retry invoices
            </Button>
          ) : null}
          <BillingInvoices
            profile={profile}
            failed={profileFailed}
            onManage={openPortal}
          />
        </>
      ) : null}
    </section>
  )
}

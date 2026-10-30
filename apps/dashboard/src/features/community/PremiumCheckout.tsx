"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { loadStripe } from "@stripe/stripe-js/pure"
import type { StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js"
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { dashboardEnv } from "@workspace/env/dashboard"
import { Button } from "@workspace/ui/components/button"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { useTheme } from "@/components/providers/theme-provider"

type Checkout = FunctionReturnType<typeof api.premiumActions.checkout>

export function PremiumCheckout({
  session,
  discordGuildId,
  announce,
  displayRole,
  onCancel,
}: {
  session: Checkout
  discordGuildId: string
  announce: boolean
  displayRole: boolean
  onCancel: () => void
}) {
  const [returning, setReturning] = useState(false)
  const [retry, setRetry] = useState(0)
  const { resolvedTheme } = useTheme()
  const key = dashboardEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const stripe = useMemo(
    () => (key?.startsWith("pk_test_") ? loadStripe(key) : null),
    [key]
  )
  if (returning)
    return (
      <CheckoutReturn
        discordGuildId={discordGuildId}
        sessionId={session.sessionId}
        onDone={onCancel}
      />
    )
  return (
    <section
      className="mx-auto w-full max-w-4xl space-y-6"
      aria-labelledby="checkout-heading"
    >
      <header className="space-y-2 border-b pb-5">
        <h2 id="checkout-heading" className="font-heading text-2xl font-medium">
          Premium checkout
        </h2>
        <p className="text-sm text-muted-foreground">
          Test payment for {session.offer.guildName}. No real money is
          collected.
        </p>
      </header>
      {stripe ? (
        <CheckoutElementsProvider
          key={retry}
          stripe={stripe}
          options={{
            clientSecret: session.clientSecret,
            defaultValues: { email: session.offer.email },
            elementsOptions: {
              appearance: {
                theme: resolvedTheme === "dark" ? "night" : "stripe",
                variables: {
                  colorPrimary: "#06b6d4",
                  colorBackground:
                    resolvedTheme === "dark" ? "#171717" : "#ffffff",
                  colorText: resolvedTheme === "dark" ? "#fafafa" : "#171717",
                  colorDanger: resolvedTheme === "dark" ? "#f87171" : "#dc2626",
                  fontFamily: "Geist, sans-serif",
                  borderRadius: "8px",
                },
              },
            },
          }}
        >
          <PaymentForm
            session={session}
            discordGuildId={discordGuildId}
            announce={announce}
            displayRole={displayRole}
            onCancel={onCancel}
            onComplete={() => setReturning(true)}
            onRetry={() => setRetry((value) => value + 1)}
          />
        </CheckoutElementsProvider>
      ) : (
        <p role="alert">
          Secure test payments are not configured. Contact Cleo support before
          continuing.
        </p>
      )}
    </section>
  )
}

function PaymentForm({
  session,
  discordGuildId,
  announce,
  displayRole,
  onCancel,
  onComplete,
  onRetry,
}: {
  session: Checkout
  discordGuildId: string
  announce: boolean
  displayRole: boolean
  onCancel: () => void
  onComplete: () => void
  onRetry: () => void
}) {
  const state = useCheckoutElements()
  const cancel = useAction(api.premiumActions.cancelCheckout)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState("")
  const [expired, setExpired] = useState(() => session.expiresAt <= Date.now())
  useEffect(() => {
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, session.expiresAt - Date.now())
    )
    return () => clearTimeout(timer)
  }, [session.expiresAt])
  async function confirm(event?: StripeExpressCheckoutElementConfirmEvent) {
    if (state.type !== "success" || inFlight.current || expired) return
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      const result = await state.checkout.confirm({
        redirect: "if_required",
        email: session.offer.email,
        ...(event ? { expressCheckoutConfirmEvent: event } : {}),
      })
      if (result.type === "error") setError(result.error.message)
      else onComplete()
    } catch {
      setError(
        "Payment confirmation was interrupted. Check your payment status before retrying."
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  async function cancelPayment() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      const result = await cancel({
        discordGuildId,
        sessionId: session.sessionId,
      })
      if (result === "complete") onComplete()
      else onCancel()
    } catch {
      setError(
        "We could not cancel this checkout. Check My billing before starting another payment."
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  if (state.type === "loading")
    return <p role="status">Loading secure payment form…</p>
  if (state.type === "error")
    return (
      <div className="space-y-4">
        <p role="alert">{state.error.message}</p>
        <Button onClick={onRetry}>Reload payment form</Button>
        <Button variant="outline" disabled={busy} onClick={cancelPayment}>
          Cancel checkout
        </Button>
      </div>
    )
  const checkout = state.checkout
  const period =
    session.offer.intervalCount === 1
      ? session.offer.interval
      : `${session.offer.intervalCount} ${session.offer.interval}s`
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
      <form
        className="min-w-0 space-y-5"
        aria-label="Payment details"
        onSubmit={(event) => {
          event.preventDefault()
          void confirm()
        }}
      >
        <ExpressCheckoutElement onConfirm={confirm} />
        <PaymentElement
          onLoadError={() =>
            setError("The payment form could not load. Reload it to try again.")
          }
        />
        {expired ? (
          <p role="alert">
            This checkout has expired. Cancel it before starting again.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <p className="text-sm leading-6 text-muted-foreground">
          By subscribing, you authorise recurring payments every {period} until
          you cancel. Manage cancellation and payment details in{" "}
          <Link
            href="/account/billing"
            className="underline underline-offset-4"
          >
            My billing
          </Link>
          . Premium does not grant Discord ownership or management permissions.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={busy || expired || !checkout.canConfirm}
          >
            {busy
              ? "Processing…"
              : `Subscribe · ${checkout.total.total.amount}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={cancelPayment}
          >
            Cancel checkout
          </Button>
        </div>
        {error ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onRetry}
          >
            Reload payment form
          </Button>
        ) : null}
      </form>
      <aside
        className="space-y-5 border-t pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6"
        aria-label="Order summary"
      >
        <h3 className="font-heading text-lg font-medium">Order summary</h3>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Community</dt>
            <dd className="mt-1 font-medium break-words">
              {session.offer.guildName}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="mt-1">{session.offer.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Billing customer</dt>
            <dd className="mt-1 break-words">
              {checkout.email ?? session.offer.email}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Billing period</dt>
            <dd className="mt-1">Every {period}, renews automatically</dd>
          </div>
          <div className="flex justify-between gap-3 border-t pt-4">
            <dt>Due today</dt>
            <dd className="font-medium">{checkout.total.total.amount}</dd>
          </div>
        </dl>
        <p className="text-xs leading-5 text-muted-foreground">
          Recognition choices: announcements {announce ? "on" : "off"},
          Supporter role {displayRole ? "on" : "off"}. Test payments do not
          publish recognition.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Payment details are collected securely by Stripe. Available payment
          methods depend on your location, device and subscription eligibility.
        </p>
      </aside>
    </div>
  )
}

/** Report authenticated Stripe status only. Entitlements are applied by signed webhook reconciliation. */
export function CheckoutReturn({
  discordGuildId,
  sessionId,
  onDone,
}: {
  discordGuildId: string
  sessionId: string
  onDone?: () => void
}) {
  const auth = useAuth()
  if (!auth.isLoaded || !auth.userId)
    return <p role="status">Loading billing account…</p>
  return (
    <CheckoutReturnContent
      key={`${auth.userId}:${auth.sessionId}:${discordGuildId}:${sessionId}`}
      discordGuildId={discordGuildId}
      sessionId={sessionId}
      onDone={onDone}
    />
  )
}

function CheckoutReturnContent({
  discordGuildId,
  sessionId,
  onDone,
}: {
  discordGuildId: string
  sessionId: string
  onDone?: () => void
}) {
  const status = useAction(api.premiumActions.checkoutStatus)
  const [response, setResponse] = useState<
    | {
        attempt: number
        value: FunctionReturnType<typeof api.premiumActions.checkoutStatus>
      }
    | { attempt: number; error: string }
    | null
  >(null)
  const [attempt, setAttempt] = useState(0)
  const current = response?.attempt === attempt ? response : null
  const result = current && "value" in current ? current.value : null
  const error = current && "error" in current ? current.error : ""
  const busy = current === null
  useEffect(() => {
    let active = true
    void status({ discordGuildId, sessionId })
      .then((value) => {
        if (active) setResponse({ attempt, value })
      })
      .catch(() => {
        if (active)
          setResponse({
            attempt,
            error:
              "We could not verify this checkout. Check My billing or retry the status check.",
          })
      })
    return () => {
      active = false
    }
  }, [attempt, discordGuildId, sessionId, status])
  return (
    <section
      className="mx-auto max-w-2xl space-y-5 py-6"
      aria-labelledby="payment-heading"
    >
      <h1 id="payment-heading" className="font-heading text-2xl font-medium">
        {result?.status === "expired"
          ? "Checkout cancelled or expired"
          : result?.status === "complete" &&
              result.paymentStatus === "no_payment_required"
            ? "Checkout complete"
            : result?.paymentStatus === "paid"
              ? "Payment confirmed"
              : "Payment status"}
      </h1>
      <p role="status" className="text-sm leading-6 text-muted-foreground">
        {busy
          ? "Checking your payment securely with Stripe…"
          : result?.status === "complete"
            ? result.paymentStatus === "no_payment_required"
              ? "No payment was due. Premium coverage waits for verified subscription reconciliation. Free coverage does not grant paid Supporter recognition."
              : result.paymentStatus === "paid"
                ? `Stripe confirmed your payment for ${result.guildName}. Premium access appears after verified billing reconciliation.`
                : "Your payment is processing. Some methods take longer to confirm. Premium access waits for verified payment evidence."
            : result?.status === "expired"
              ? "No new payment can be made through this checkout."
              : "Checkout has not completed. Return to the community to resume your existing checkout."}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-4 text-sm">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh payment status
        </Button>
        {onDone ? (
          <Button variant="ghost" onClick={onDone}>
            Return to community
          </Button>
        ) : (
          <Link
            className="self-center underline underline-offset-4"
            href={`/dashboard/${discordGuildId}/premium`}
          >
            Return to community
          </Link>
        )}
        <Link
          className="self-center underline underline-offset-4"
          href="/account/billing"
        >
          My billing
        </Link>
      </div>
    </section>
  )
}

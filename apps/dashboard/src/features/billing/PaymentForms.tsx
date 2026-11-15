"use client"

import { useEffect, useState } from "react"
import {
  AddressElement,
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js/pure"
import type { Stripe } from "@stripe/stripe-js"
import type { FunctionReturnType } from "convex/server"
import { useAction } from "convex/react"
import { ConvexError } from "convex/values"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { dashboardEnv } from "@workspace/env/dashboard"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { useTheme } from "@/components/providers/theme-provider"

export type BillingProfile = FunctionReturnType<
  typeof api.billingPortalActions.profile
>
type Setup = FunctionReturnType<typeof api.billingPortalActions.beginSetup>
const publicKey = dashboardEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = publicKey?.startsWith("pk_test_")
  ? loadStripe(publicKey).catch(() => null)
  : null
// Resolve before mounting Elements. Its async provider currently loses its
// initialization state under React 19 StrictMode's repeated updater calls.
function useBillingStripe() {
  const [stripe, setStripe] = useState<Stripe | null>(null)
  const [failed, setFailed] = useState(!stripePromise)
  useEffect(() => {
    let active = true
    void stripePromise
      ?.then((value) => {
        if (active) {
          setStripe(value)
          setFailed(!value)
        }
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])
  return { stripe, failed }
}
export function billingError(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback
}
function useAppearance() {
  const { resolvedTheme } = useTheme()
  return {
    theme: resolvedTheme === "dark" ? ("night" as const) : ("stripe" as const),
    variables: {
      colorPrimary: "#06b6d4",
      colorBackground: resolvedTheme === "dark" ? "#171717" : "#ffffff",
      colorText: resolvedTheme === "dark" ? "#fafafa" : "#171717",
      fontFamily: "Geist, sans-serif",
      borderRadius: "8px",
    },
  }
}

export function PaymentSetupDialog({
  setup,
  onSaved,
  onClose,
}: {
  setup: Setup
  onSaved: (processing: boolean) => void
  onClose: () => void
}) {
  const appearance = useAppearance()
  const { stripe, failed } = useBillingStripe()
  const cancel = useAction(api.billingPortalActions.cancelSetup)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function close() {
    if (busy) return
    setBusy(true)
    try {
      await cancel({ setupIntentId: setup.id })
      onClose()
    } catch (failure) {
      setError(
        billingError(
          failure,
          "Payment setup could not be closed. Please try again."
        )
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update payment method</DialogTitle>
          <DialogDescription>
            Save a payment method for future invoices. You won’t be charged now.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {stripe ? (
          <Elements
            stripe={stripe}
            options={{ clientSecret: setup.clientSecret, appearance }}
          >
            <PaymentSetupForm
              setup={setup}
              busy={busy}
              setBusy={setBusy}
              onSaved={onSaved}
              onCancel={close}
            />
          </Elements>
        ) : failed ? (
          <p role="alert">
            Secure payment collection is unavailable. Please contact support.
          </p>
        ) : (
          <p role="status">Loading secure payment form…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
function PaymentSetupForm({
  setup,
  busy,
  setBusy,
  onSaved,
  onCancel,
}: {
  setup: Setup
  busy: boolean
  setBusy: (busy: boolean) => void
  onSaved: (processing: boolean) => void
  onCancel: () => Promise<void>
}) {
  const stripe = useStripe(),
    elements = useElements()
  const complete = useAction(api.billingPortalActions.completeSetup)
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true)
    setError("")
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: setup.returnUrl },
        redirect: "if_required",
      })
      if (result.error) {
        setError(
          result.error.message ?? "The payment method could not be saved."
        )
        return
      }
      const status = await complete({ setupIntentId: setup.id })
      onSaved(status === "processing")
    } catch (failure) {
      setError(
        billingError(
          failure,
          "Payment setup was interrupted. Check your saved methods before trying again."
        )
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        By saving, you authorise Cleo to use this method for future invoices for
        subscriptions you purchase. It becomes your account’s default payment
        method.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !stripe || !elements}>
          {busy ? "Saving…" : "Save payment method"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void onCancel()}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function BillingDetailsDialog({
  customer,
  onSaved,
  onClose,
}: {
  customer: BillingProfile["customer"]
  onSaved: () => void
  onClose: () => void
}) {
  const appearance = useAppearance()
  const { stripe, failed } = useBillingStripe()
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Billing details</DialogTitle>
          <DialogDescription>
            The name, email and address shown on future invoices.
          </DialogDescription>
        </DialogHeader>
        {stripe ? (
          <Elements
            stripe={stripe}
            options={{ appearance, mode: "setup", currency: "gbp" }}
          >
            <BillingDetailsForm
              customer={customer}
              busy={busy}
              setBusy={setBusy}
              onSaved={onSaved}
              onClose={onClose}
            />
          </Elements>
        ) : failed ? (
          <p role="alert">
            Secure address collection is unavailable. Please contact support.
          </p>
        ) : (
          <p role="status">Loading secure billing form…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
function BillingDetailsForm({
  customer,
  busy,
  setBusy,
  onSaved,
  onClose,
}: {
  customer: BillingProfile["customer"]
  busy: boolean
  setBusy: (busy: boolean) => void
  onSaved: () => void
  onClose: () => void
}) {
  const elements = useElements()
  const update = useAction(api.billingPortalActions.updateDetails)
  const [email, setEmail] = useState(customer?.email ?? "")
  const [pending, setPending] = useState<{
    fingerprint: string
    key: string
  } | null>(null)
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !elements) return
    const address = await elements.getElement("address")?.getValue()
    if (!address?.complete) {
      setError("Complete your billing name and address.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const details = {
        name: address.value.name,
        email,
        address: {
          line1: address.value.address.line1,
          line2: address.value.address.line2 ?? "",
          city: address.value.address.city,
          state: address.value.address.state,
          postalCode: address.value.address.postal_code,
          country: address.value.address.country,
        },
      }
      const fingerprint = JSON.stringify(details)
      const operation =
        pending?.fingerprint === fingerprint
          ? pending
          : { fingerprint, key: crypto.randomUUID() }
      setPending(operation)
      await update({ ...details, key: operation.key })
      onSaved()
    } catch (failure) {
      setError(
        billingError(
          failure,
          "Billing details could not be saved. Please try again."
        )
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block space-y-2 text-sm">
        <span>Billing email</span>
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <AddressElement
        options={{
          mode: "billing",
          defaultValues: customer
            ? {
                name: customer.name,
                ...(customer.address.country
                  ? {
                      address: {
                        line1: customer.address.line1,
                        line2: customer.address.line2,
                        city: customer.address.city,
                        state: customer.address.state,
                        country: customer.address.country,
                        postal_code: customer.address.postalCode,
                      },
                    }
                  : {}),
              }
            : undefined,
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !elements}>
          {busy ? "Saving…" : "Save billing details"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

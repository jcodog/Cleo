"use client"

import { useState } from "react"
import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconCreditCard,
  IconBuildingBank,
  IconArrowUpRight,
  IconPlus,
  IconDownload,
} from "@tabler/icons-react"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { dashboardEnv } from "@workspace/env/dashboard"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { formatStripeAmount } from "@/features/community/formatStripeAmount"
import {
  billingError,
  BillingDetailsDialog,
  PaymentSetupDialog,
  type BillingProfile,
} from "./PaymentForms"

type Method = BillingProfile["methods"][number]
export function SavedPaymentMethod({ method }: { method: Method }) {
  return method.type === "card" ? (
    <div
      role="img"
      aria-label={`${method.label} ending ${method.last4}, expires ${method.expiryMonth}/${method.expiryYear}`}
      className="flex aspect-[1.586] w-full max-w-64 flex-col justify-between rounded-xl border border-white/15 bg-neutral-900 p-5 text-white shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="font-heading text-lg font-medium">Cleo</span>
        <span className="text-sm font-semibold tracking-wide uppercase">
          {method.brand}
        </span>
      </div>
      <div className="space-y-3">
        <p className="font-mono text-sm tracking-[0.1em] whitespace-nowrap">
          •••• •••• •••• {method.last4}
        </p>
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>Expires</span>
          <span className="font-mono text-neutral-200">
            {String(method.expiryMonth).padStart(2, "0")} /{" "}
            {String(method.expiryYear).slice(-2)}
          </span>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-4 rounded-lg border px-5 py-6">
      <IconBuildingBank aria-hidden className="size-7 text-muted-foreground" />
      <div>
        <p className="font-medium capitalize">{method.label}</p>
        {method.last4 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Ending in {method.last4}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function PaymentDetails({
  profile,
  loading,
  failed,
  onRefresh,
  onNotice,
  onSetupPending,
  onManage,
}: {
  profile: BillingProfile | null
  loading: boolean
  failed: boolean
  onRefresh: () => void
  onNotice: (notice: string) => void
  onSetupPending: (id: string | null) => void
  onManage: () => void
}) {
  const begin = useAction(api.billingPortalActions.beginSetup)
  const makeDefault = useAction(api.billingPortalActions.makeDefault)
  const remove = useAction(api.billingPortalActions.removeMethod)
  const [setup, setSetup] = useState<FunctionReturnType<
    typeof api.billingPortalActions.beginSetup
  > | null>(null)
  const [setupKey, setSetupKey] = useState(() => crypto.randomUUID())
  const [editing, setEditing] = useState(false)
  const [showMethods, setShowMethods] = useState(false)
  const [busy, setBusy] = useState(false)
  const [methodNotice, setMethodNotice] = useState("")
  const [removing, setRemoving] = useState<Method | null>(null)
  const [pending, setPending] = useState<{
    key: string
    id: string
    kind: "default" | "remove"
  } | null>(null)
  const customer = profile?.customer
  const defaultMethod = profile?.methods.find(
    (method) => method.id === customer?.defaultMethodId
  )
  const otherCount = (profile?.methods.length ?? 0) - (defaultMethod ? 1 : 0)
  const canCollect =
    dashboardEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") ===
    true
  async function startSetup() {
    if (busy) return
    setBusy(true)
    onNotice("")
    const key = setupKey
    try {
      const value = await begin({ key, returnOrigin: window.location.origin })
      setSetup(value)
      onSetupPending(value.id)
    } catch (error) {
      onNotice(
        billingError(
          error,
          "Payment-method setup could not be opened. Please try again."
        )
      )
    } finally {
      setBusy(false)
    }
  }
  async function changeMethod(method: Method, kind: "default" | "remove") {
    if (busy) return
    setBusy(true)
    setMethodNotice("")
    const operation =
      pending?.id === method.id && pending.kind === kind
        ? pending
        : { id: method.id, key: crypto.randomUUID(), kind }
    setPending(operation)
    try {
      await (kind === "default" ? makeDefault : remove)({
        paymentMethodId: method.id,
        key: operation.key,
      })
      setPending(null)
      setRemoving(null)
      setMethodNotice(
        kind === "default"
          ? "Default payment method updated."
          : "Payment method removed."
      )
      onRefresh()
    } catch (error) {
      setMethodNotice(
        billingError(
          error,
          "The payment method could not be updated. Refresh your billing details and try again."
        )
      )
    } finally {
      setBusy(false)
    }
  }
  if (failed)
    return (
      <section className="flex flex-wrap items-center justify-between gap-4 border-y py-6">
        <p role="alert" className="text-sm">
          Payment details could not be loaded from Stripe.
        </p>
        <Button variant="outline" onClick={onRefresh}>
          Retry payment details
        </Button>
      </section>
    )
  if (loading)
    return (
      <section
        role="status"
        className="border-y py-8 text-sm text-muted-foreground"
      >
        Loading payment details…
      </section>
    )
  return (
    <>
      <div className="grid gap-8 border-y py-7 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <section aria-labelledby="payment-method-heading" className="space-y-5">
          <header className="flex items-center justify-between gap-3">
            <h2
              id="payment-method-heading"
              className="font-heading text-lg font-medium"
            >
              Payment method
            </h2>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !canCollect}
              onClick={() => void startSetup()}
            >
              <IconPlus aria-hidden />
              {defaultMethod ? "Update" : "Add payment method"}
            </Button>
          </header>
          {defaultMethod ? (
            <div className="flex flex-wrap items-center gap-6">
              <SavedPaymentMethod method={defaultMethod} />
              <div className="space-y-1">
                <p className="text-sm font-medium capitalize">
                  {defaultMethod.label}
                </p>
                <p className="text-sm text-muted-foreground">Account default</p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-36 items-center gap-4 rounded-lg border border-dashed p-5">
              <IconCreditCard
                aria-hidden
                className="size-7 shrink-0 text-muted-foreground"
              />
              <div>
                <p className="text-sm font-medium">
                  {otherCount
                    ? "Choose a default payment method"
                    : "No payment method saved"}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {otherCount
                    ? "Your saved methods are available below."
                    : "Add one securely when you’re ready."}
                </p>
              </div>
            </div>
          )}
          {profile?.methods.length ? (
            <button
              type="button"
              onClick={() => {
                setShowMethods(true)
                setMethodNotice("")
              }}
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {otherCount > 0
                ? `${otherCount}${profile.hasMoreMethods ? "+" : ""} ${defaultMethod ? "other " : "saved "}payment ${otherCount === 1 ? "method" : "methods"}`
                : "Manage saved payment method"}
              <IconArrowUpRight aria-hidden size={15} />
            </button>
          ) : null}
          {!canCollect ? (
            <p className="text-sm text-muted-foreground">
              Payment-method updates are currently unavailable.
            </p>
          ) : null}
        </section>
        <section
          aria-labelledby="billing-details-heading"
          className="space-y-5"
        >
          <header className="flex items-center justify-between gap-3">
            <h2
              id="billing-details-heading"
              className="font-heading text-lg font-medium"
            >
              Billing details
            </h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canCollect}
              onClick={() => setEditing(true)}
            >
              {customer?.name ? "Edit" : "Add details"}
            </Button>
          </header>
          {customer?.name || customer?.email || customer?.address.line1 ? (
            <div className="space-y-3 text-sm leading-6">
              <p className="font-medium">{customer.name}</p>
              <p className="text-muted-foreground">{customer.email}</p>
              {customer.address.line1 ? (
                <address className="text-muted-foreground not-italic">
                  {[
                    customer.address.line1,
                    customer.address.line2,
                    [
                      customer.address.city,
                      customer.address.state,
                      customer.address.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", "),
                    customer.address.country,
                  ]
                    .filter(Boolean)
                    .map((line, index) => (
                      <span key={index} className="block">
                        {line}
                      </span>
                    ))}
                </address>
              ) : (
                <p className="text-muted-foreground">
                  No billing address added
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              Add the name, email and address you want on future invoices.
            </p>
          )}
        </section>
      </div>
      {setup ? (
        <PaymentSetupDialog
          setup={setup}
          onClose={() => {
            setSetup(null)
            setSetupKey(crypto.randomUUID())
            onSetupPending(null)
          }}
          onSaved={(processing) => {
            setSetup(null)
            setSetupKey(crypto.randomUUID())
            if (!processing) onSetupPending(null)
            onNotice(
              processing
                ? "Your bank is confirming the payment method. Check its status below before trying again."
                : "Payment method saved as your default."
            )
            onRefresh()
          }}
        />
      ) : null}
      {editing ? (
        <BillingDetailsDialog
          customer={customer ?? null}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onRefresh()
            onNotice("Billing details updated.")
          }}
        />
      ) : null}
      <Dialog
        open={showMethods}
        onOpenChange={(open) => {
          if (!busy) {
            setShowMethods(open)
            setRemoving(null)
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Saved payment methods</DialogTitle>
            <DialogDescription>
              Choose the default for future invoices. Existing
              subscription-specific payment methods stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {methodNotice ? (
            <p role="status" className="text-sm">
              {methodNotice}
            </p>
          ) : null}
          <div className="divide-y">
            {profile?.methods.map((method) => (
              <div
                key={method.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="text-sm font-medium capitalize">
                    {method.label}
                    {method.last4 ? ` •••• ${method.last4}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {method.id === customer?.defaultMethodId
                      ? "Default"
                      : "Saved payment method"}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!method.manageable ? (
                    <Button size="sm" variant="outline" onClick={onManage}>
                      Manage in Stripe
                    </Button>
                  ) : null}
                  {method.manageable &&
                  method.id !== customer?.defaultMethodId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void changeMethod(method, "default")}
                    >
                      Make default
                    </Button>
                  ) : null}
                  {method.manageable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || method.id === customer?.defaultMethodId}
                      title={
                        method.id === customer?.defaultMethodId
                          ? "Choose another default before removing this method."
                          : undefined
                      }
                      onClick={() => {
                        setRemoving(method)
                        setMethodNotice("")
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {removing ? (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm">
                Remove {removing.label}
                {removing.last4 ? ` ending ${removing.last4}` : ""}? You’ll need
                to add it again to use it later.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void changeMethod(removing, "remove")}
                >
                  Confirm removal
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRemoving(null)}
                >
                  Keep payment method
                </Button>
              </div>
            </div>
          ) : null}
          {profile?.hasMoreMethods ? (
            <p className="text-xs text-muted-foreground">
              Showing the first 100 saved methods. Contact support for the
              remaining methods.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function BillingInvoices({
  profile,
  failed,
  onManage,
}: {
  profile: BillingProfile | null
  failed: boolean
  onManage: () => void
}) {
  return (
    <section
      aria-labelledby="invoices-heading"
      className="space-y-5 border-t pt-7"
    >
      <header className="flex items-center justify-between">
        <h2 id="invoices-heading" className="font-heading text-lg font-medium">
          Invoices
        </h2>
        {profile?.hasMoreInvoices ? (
          <Button variant="ghost" size="sm" onClick={onManage}>
            View all invoices
            <IconArrowUpRight aria-hidden />
          </Button>
        ) : null}
      </header>
      {failed ? (
        <p className="text-sm text-muted-foreground">
          Invoices could not be loaded. Retry payment details above.
        </p>
      ) : !profile ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading invoices…
        </p>
      ) : !profile.invoices.length ? (
        <p className="text-sm text-muted-foreground">
          Your invoices will appear here after your first purchase.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Billing invoices</caption>
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-3 font-medium">Invoice</th>
                <th className="px-3 font-medium">Date</th>
                <th className="px-3 font-medium">Amount</th>
                <th className="px-3 font-medium">Status</th>
                <th className="sr-only">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {profile.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="py-4 font-medium">
                    {invoice.url ? (
                      <a
                        href={invoice.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {invoice.number ?? "Invoice"}
                      </a>
                    ) : (
                      (invoice.number ?? "Draft invoice")
                    )}
                  </td>
                  <td className="px-3 whitespace-nowrap text-muted-foreground">
                    {new Date(invoice.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    {formatStripeAmount(invoice.amount, invoice.currency)}
                  </td>
                  <td className="px-3 capitalize">
                    {invoice.status.replaceAll("_", " ")}
                  </td>
                  <td className="text-right">
                    {invoice.pdf ? (
                      <a
                        href={invoice.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Download invoice ${invoice.number ?? invoice.id}`}
                        className="inline-flex p-2 text-muted-foreground hover:text-foreground"
                      >
                        <IconDownload aria-hidden size={17} />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

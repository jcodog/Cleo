"use client"

import { useAuth } from "@clerk/nextjs"
import { useAction, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useState } from "react"
import Link from "next/link"
import { formatStripeAmount } from "@/features/community/formatStripeAmount"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"

export function BillingProducts({ productId }: { productId?: string }) {
  const auth = useAuth()
  if (!auth.isLoaded || !auth.userId)
    return <p role="status">Loading billing catalogue…</p>
  return (
    <Catalogue
      key={`${auth.userId}:${auth.sessionId}:${productId ?? "list"}`}
      productId={productId}
    />
  )
}

function Catalogue({ productId }: { productId?: string }) {
  const { getToken } = useAuth()
  const access = useQuery(api.billingCatalogue.access, {})
  const history = useQuery(
    api.billingCatalogue.history,
    access?.canRead ? {} : "skip"
  )
  const list = useAction(api.billingCatalogueActions.list)
  const detail = useAction(api.billingCatalogueActions.detail)
  const change = useAction(api.billingCatalogueActions.change)
  const [products, setProducts] = useState<FunctionReturnType<
    typeof api.billingCatalogueActions.list
  > | null>(null)
  const [selected, setSelected] = useState<FunctionReturnType<
    typeof api.billingCatalogueActions.detail
  > | null>(null)
  const [cursor, setCursor] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{
    key: string
    request: string
  } | null>(null)
  const [confirmation, setConfirmation] = useState("")
  useEffect(() => {
    if (!access?.canRead) return
    let active = true
    const request = productId ? detail({ productId, cursor }) : list({ cursor })
    void request
      .then((value) => {
        if (!active) return
        if ("products" in value) setProducts(value)
        else setSelected(value)
      })
      .catch(() => {
        if (active)
          setError(
            "The Cleo sandbox catalogue is unavailable. Check your staff access and Stripe configuration, then retry."
          )
      })
    return () => {
      active = false
    }
  }, [access?.canRead, cursor, detail, list, productId, revision])
  function propose(request: Record<string, string | number>) {
    setPending({ key: crypto.randomUUID(), request: JSON.stringify(request) })
    setConfirmation("")
    setError("")
  }
  async function confirm() {
    if (!pending || busy) return
    setBusy(true)
    setError("")
    try {
      const token = await getToken({ skipCache: true })
      if (!token)
        throw new Error("Sign in again to verify this financial change.")
      await change({ ...pending, sessionToken: token, confirmation })
      setPending(null)
      setRevision((value) => value + 1)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The operation could not be confirmed. Retry this same operation after checking Stripe."
      )
    } finally {
      setBusy(false)
    }
  }
  const product = selected?.product
  const rows =
    products?.products.filter((row) =>
      `${row.name} ${row.id} ${row.defaultPrice ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ) ?? []
  const prices =
    selected?.prices.filter((row) =>
      `${row.id} ${row.currency} ${row.amount ?? ""} ${row.interval ?? "one time"}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ) ?? []
  const next = selected?.next ?? products?.next
  if (access && !access.canRead)
    return (
      <p role="alert" className="p-6 text-sm">
        The billing catalogue is available to Cleo staff only.
      </p>
    )
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <header className="space-y-2 border-b pb-5">
        {productId ? (
          <Link
            href="/staff/billing/products"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Products and prices
          </Link>
        ) : null}
        <h1 className="font-heading text-2xl font-medium">
          {product?.name ?? "Products and prices"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Cleo Dev Sandbox · No live changes. Existing subscription prices and
          entitlement mappings are preserved.
        </p>
      </header>
      {error ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError("")
              setRevision((value) => value + 1)
            }}
          >
            Retry catalogue
          </Button>
          <Link href="/account/security" className="ml-3 underline">
            Account security
          </Link>
        </div>
      ) : null}
      {!products && !selected && !error ? (
        <p role="status">Reading Stripe catalogue…</p>
      ) : null}
      {product ? (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Product ID</dt>
            <dd className="mt-1 font-mono text-xs break-all">{product.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-1">{product.active ? "Active" : "Archived"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Description</dt>
            <dd className="mt-1">{product.description || "No description"}</dd>
          </div>
        </dl>
      ) : null}
      {products || selected ? (
        <>
          <label className="block max-w-md space-y-2 text-sm">
            Search this page
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                selected
                  ? "Price ID, currency or interval"
                  : "Product name or ID"
              }
            />
          </label>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {selected ? "Stripe prices" : "Stripe products"}
              </caption>
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  {(selected
                    ? [
                        "Price",
                        "Amount",
                        "Billing",
                        "Status",
                        "Entitlement",
                        "Actions",
                      ]
                    : ["Product", "Status", "Default price"]
                  ).map((label) => (
                    <th key={label} className="px-4 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {selected
                  ? prices.map((price) => (
                      <tr key={price.id}>
                        <td className="px-4 py-4 font-mono text-xs">
                          {price.id}
                          {product?.defaultPrice === price.id ? (
                            <span className="mt-1 block font-sans text-muted-foreground">
                              Default
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {price.amount === null
                            ? "Variable pricing"
                            : formatStripeAmount(price.amount, price.currency)}
                        </td>
                        <td className="px-4 py-4">
                          {price.interval
                            ? `Every ${price.intervalCount} ${price.interval}`
                            : "One time"}
                        </td>
                        <td className="px-4 py-4">
                          {price.active ? "Active" : "Archived"}
                        </td>
                        <td className="px-4 py-4">
                          {price.approved ? "Guild Premium" : "Unmapped"}
                        </td>
                        <td className="px-4 py-4">
                          {access?.canWrite && product ? (
                            <div className="flex gap-2">
                              {price.active &&
                              product.active &&
                              product.defaultPrice !== price.id ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    propose({
                                      kind: "defaultPrice",
                                      productId: product.id,
                                      priceId: price.id,
                                    })
                                  }
                                >
                                  Make default
                                </Button>
                              ) : null}
                              {price.active &&
                              product.active &&
                              price.interval &&
                              !price.approved ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    propose({
                                      kind: "approvePremium",
                                      productId: product.id,
                                      priceId: price.id,
                                    })
                                  }
                                >
                                  Map Premium
                                </Button>
                              ) : null}
                              {price.active &&
                              product.defaultPrice !== price.id ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    propose({
                                      kind: "archivePrice",
                                      productId: product.id,
                                      priceId: price.id,
                                    })
                                  }
                                >
                                  Archive
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            "Read only"
                          )}
                        </td>
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-4">
                          <Link
                            href={`/staff/billing/products/${row.id}`}
                            className="font-medium underline underline-offset-4"
                          >
                            {row.name}
                          </Link>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {row.id}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          {row.active ? "Active" : "Archived"}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs">
                          {row.defaultPrice ?? "No default"}
                        </td>
                      </tr>
                    ))}
                {(selected ? prices : rows).length === 0 ? (
                  <tr>
                    <td
                      colSpan={selected ? 6 : 3}
                      className="px-4 py-8 text-muted-foreground"
                    >
                      No matching entries on this page.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            {cursor ? (
              <Button
                variant="outline"
                onClick={() => {
                  setCursor(undefined)
                  setSearch("")
                }}
              >
                First page
              </Button>
            ) : null}
            {next ? (
              <Button
                variant="outline"
                onClick={() => {
                  setCursor(next)
                  setSearch("")
                }}
              >
                Next page
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {access?.canWrite ? (
        <div className="space-y-6 border-t pt-6">
          <form
            className="max-w-xl space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              propose({
                kind: product ? "editProduct" : "createProduct",
                ...(product ? { productId: product.id } : {}),
                name: String(data.get("name")),
                description: String(data.get("description")),
              })
            }}
          >
            <h2 className="font-heading text-lg font-medium">
              {product ? "Edit product" : "Create sandbox product"}
            </h2>
            <label className="block space-y-2 text-sm">
              Name
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={product?.name}
                key={product?.name}
              />
            </label>
            <label className="block space-y-2 text-sm">
              Description
              <Input
                name="description"
                maxLength={500}
                defaultValue={product?.description ?? ""}
                key={product?.description}
              />
            </label>
            <Button type="submit">Review product change</Button>
            {product?.active ? (
              <Button
                type="button"
                className="ml-3"
                variant="outline"
                onClick={() =>
                  propose({ kind: "archiveProduct", productId: product.id })
                }
              >
                Archive product
              </Button>
            ) : null}
          </form>
          {product?.active ? (
            <form
              className="max-w-xl space-y-4 border-t pt-6"
              onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                propose({
                  kind: "createPrice",
                  productId: product.id,
                  amount: Number(data.get("amount")),
                  currency: String(data.get("currency")).toLowerCase(),
                  interval: String(data.get("interval")),
                  intervalCount: Number(data.get("intervalCount")),
                })
              }}
            >
              <h2 className="font-heading text-lg font-medium">Create price</h2>
              <p className="text-sm text-muted-foreground">
                Amounts on existing Prices cannot change. A new Price does not
                migrate subscribers.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  Amount in minor units
                  <Input
                    name="amount"
                    type="number"
                    min={0}
                    step={1}
                    required
                    placeholder="499 = £4.99"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  Currency code
                  <Input
                    name="currency"
                    required
                    pattern="[A-Za-z]{3}"
                    defaultValue="gbp"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  Billing period
                  <select
                    name="interval"
                    className="h-9 w-full rounded-md border bg-background px-3"
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                    <option value="week">Weekly</option>
                    <option value="day">Daily</option>
                    <option value="one_time">One time</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  Interval count
                  <Input
                    name="intervalCount"
                    type="number"
                    min={1}
                    max={36}
                    defaultValue={1}
                    required
                  />
                </label>
              </div>
              <Button type="submit">Review new price</Button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Catalogue changes require explicit financial management access and an
          enabled sandbox write gate.
        </p>
      )}
      <section className="space-y-3 border-t pt-5">
        <h2 className="font-heading text-lg font-medium">Recent operations</h2>
        <ul className="divide-y text-sm">
          {history?.map((row) => (
            <li key={row.key} className="py-3">
              <span>
                {row.completedAt ? "Completed" : "Pending or uncertain"} ·{" "}
                {new Date(row.createdAt).toLocaleString()}
              </span>
              <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                {row.request}
              </p>
            </li>
          ))}
        </ul>
        {history?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No catalogue operations recorded.
          </p>
        ) : null}
      </section>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm sandbox catalogue change</DialogTitle>
            <DialogDescription>
              This affects new sales in Cleo Dev Sandbox. Existing subscriptions
              and historical mappings remain. Changing a default does not change
              the configured checkout Price.
            </DialogDescription>
          </DialogHeader>
          <pre className="overflow-x-auto rounded-md border p-3 text-xs">
            {pending
              ? JSON.stringify(JSON.parse(pending.request), null, 2)
              : ""}
          </pre>
          <label className="space-y-2 text-sm">
            Type CONFIRM SANDBOX CHANGE
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            A recently verified Clerk session is required. If this operation is
            uncertain, retry here with the same request.
          </p>
          {error ? (
            <p role="alert" className="text-sm">
              {error}
            </p>
          ) : null}
          <Button
            disabled={busy || confirmation !== "CONFIRM SANDBOX CHANGE"}
            onClick={confirm}
          >
            {busy ? "Confirming…" : "Confirm change"}
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  )
}

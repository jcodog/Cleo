import type { ReactNode } from "react"
import type { StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js"

const params = new URLSearchParams(location.search)
export const loadStripe = () => Promise.resolve(null)
export function CheckoutElementsProvider({
  children,
}: {
  children: ReactNode
}) {
  return <>{children}</>
}
export function PaymentElement() {
  return (
    <div aria-label="Stripe payment collection">
      Secure payment form fixture
    </div>
  )
}
export function ExpressCheckoutElement({
  onConfirm,
}: {
  onConfirm: (event: StripeExpressCheckoutElementConfirmEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onConfirm({} as StripeExpressCheckoutElementConfirmEvent)}
    >
      Pay with eligible wallet
    </button>
  )
}
export function useCheckoutElements() {
  if (params.has("formError"))
    return { type: "error", error: { message: "Payment form unavailable" } }
  return {
    type: "success",
    checkout: {
      canConfirm: true,
      email: "alice@example.com",
      total: { total: { amount: "£4.99" } },
      confirm: async (options: unknown) => {
        window.dispatchEvent(
          new CustomEvent("stripe-confirm-fixture", { detail: options })
        )
        if (params.has("interruptPayment"))
          throw new Error("Connection interrupted")
        if (params.has("denyPayment"))
          return {
            type: "error",
            error: {
              message: "Your payment was declined. Try another method.",
            },
          }
        return { type: "success" }
      },
    },
  }
}

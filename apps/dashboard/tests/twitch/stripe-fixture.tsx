import type { ReactNode } from "react"
import type { StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js"

const params = new URLSearchParams(location.search)
export const loadStripe = () =>
  Promise.resolve(params.has("stripeUnavailable") ? null : {})
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
export function Elements({
  stripe,
  children,
}: {
  stripe: unknown
  children: ReactNode
}) {
  if (stripe && typeof stripe === "object" && "then" in stripe)
    throw new Error(
      "Billing Elements must receive an initialized Stripe instance"
    )
  return <>{children}</>
}
export function AddressElement() {
  return (
    <div aria-label="Stripe billing address collection">
      Test Billing, 1 Test Street, London
    </div>
  )
}
export function useElements() {
  return {
    getElement: () => ({
      getValue: async () => ({
        complete: true,
        value: {
          name: "Test Billing",
          address: {
            line1: "1 Test Street",
            line2: "",
            city: "London",
            state: "",
            postal_code: "SW1A 1AA",
            country: "GB",
          },
        },
      }),
    }),
  }
}
export function useStripe() {
  return {
    confirmSetup: async (options: unknown) => {
      window.dispatchEvent(
        new CustomEvent("stripe-setup-fixture", { detail: options })
      )
      return params.has("denySetup")
        ? {
            error: {
              message:
                "This payment method could not be authorised. Try another method.",
            },
          }
        : {
            setupIntent: {
              id: "seti_fixture",
              status: params.has("setupProcessing")
                ? "processing"
                : "succeeded",
            },
          }
    },
  }
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

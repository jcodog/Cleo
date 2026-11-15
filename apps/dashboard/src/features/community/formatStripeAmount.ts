/** Stripe uses ISO minor units, with legacy two-decimal API representations for ISK and UGX. */
export function formatStripeAmount(
  amount: number,
  currency: string,
  locale?: string
) {
  const code = currency.toUpperCase()
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
  })
  const digits =
    code === "ISK" || code === "UGX"
      ? 2
      : (formatter.resolvedOptions().maximumFractionDigits ?? 2)
  return formatter.format(amount / 10 ** digits)
}

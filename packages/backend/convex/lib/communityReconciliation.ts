export function nextSubscriptionReconciliation(
  status: string,
  endsAt: number,
  now: number
) {
  return ["revoked", "canceled", "incomplete_expired"].includes(status) ||
    endsAt <= now
    ? null
    : Math.min(now + 300000, endsAt + 1)
}

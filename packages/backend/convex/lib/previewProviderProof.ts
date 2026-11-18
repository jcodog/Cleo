/** Read-only provider evidence. Never expose credentials or provider responses. */
export async function verifyPreviewProviders(
  env: Record<string, string | undefined>,
  issuer: string,
  request: typeof fetch = fetch
): Promise<boolean> {
  try {
    const domains = await request("https://api.clerk.com/v1/domains", {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
      signal: AbortSignal.timeout(15000),
    })
    const clerk: unknown = await domains.json()
    if (
      !domains.ok ||
      !clerk ||
      typeof clerk !== "object" ||
      !("data" in clerk) ||
      !Array.isArray(clerk.data) ||
      !clerk.data.some(
        (domain: unknown) =>
          !!domain &&
          typeof domain === "object" &&
          "frontend_api_url" in domain &&
          (domain.frontend_api_url === issuer ||
            domain.frontend_api_url === new URL(issuer).hostname)
      )
    )
      return false
    if (!env.STRIPE_SECRET_KEY) return true
    const response = await request("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(15000),
    })
    const account: unknown = await response.json()
    return (
      response.ok &&
      !!account &&
      typeof account === "object" &&
      "id" in account &&
      account.id === "acct_1RGgwvE1e1YdqDQQ" &&
      account.id === env.STRIPE_EXPECTED_ACCOUNT_ID
    )
  } catch {
    return false
  }
}

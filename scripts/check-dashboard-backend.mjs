import { pathToFileURL } from "node:url"

const functions = [
  ["query", "accountBilling:overview", {}],
  ["query", "billingCatalogue:access", {}],
  ["action", "premiumActions:offer", { discordGuildId: "000000000000000000" }],
]

/** Unauthenticated probes must reach the auth guard, never create financial objects. */
export async function checkDashboardBackend(url, request = fetch) {
  const deployment = new URL(url)
  if (
    deployment.protocol !== "https:" ||
    !deployment.hostname.endsWith(".convex.cloud")
  )
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL must identify the intended hosted Convex deployment."
    )
  for (const [kind, name, args] of functions) {
    const response = await request(`${deployment.origin}/api/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: name, args, format: "json" }),
      signal: AbortSignal.timeout(15000),
    })
    const result = await response.json()
    if (/Could not find public function/.test(result.errorMessage ?? ""))
      throw new Error(
        `${name} is missing on ${deployment.hostname}. Sync the matching backend revision before building this preview.`
      )
    if (
      result.status !== "error" ||
      !/signed in|Unauthenticated|not authenticated/i.test(
        result.errorMessage ?? ""
      )
    )
      throw new Error(
        `${name} did not return the expected authentication guard on ${deployment.hostname}. Inspect the deployment logs.`
      )
  }
  return deployment.hostname
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href &&
  (process.env.VERCEL_ENV === "preview" || process.argv.includes("--check"))
) {
  try {
    const host = await checkDashboardBackend(process.env.NEXT_PUBLIC_CONVEX_URL)
    console.log(
      `Dashboard backend functions verified on ${host}; authenticated and Stripe acceptance checks are still required.`
    )
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Dashboard backend check failed."
    )
    process.exitCode = 1
  }
}

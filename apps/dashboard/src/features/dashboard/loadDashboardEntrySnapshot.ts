import { fetchQuery } from "convex/nextjs"
import { api } from "@workspace/backend/convex/_generated/api.js"
import { getConvexAuthToken } from "@/lib/convex-auth"

/** Timestamp the authenticated server read so cached route payloads cannot resume stale guilds. */
export async function loadDashboardEntrySnapshot() {
  const token = await getConvexAuthToken()
  try {
    const value = await fetchQuery(
      api.queries.dashboard.discord.guilds.directory.list,
      {},
      { token }
    )
    return { value, resolvedAt: Date.now() }
  } catch {
    return undefined
  }
}

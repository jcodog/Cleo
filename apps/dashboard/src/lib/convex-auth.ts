import { auth } from "@clerk/nextjs/server"

export async function getConvexAuthToken() {
  const { getToken, sessionClaims } = await auth.protect()
  const audience = sessionClaims.aud
  const hasConvexAudience = Array.isArray(audience)
    ? audience.includes("convex")
    : audience === "convex"
  const token = hasConvexAudience
    ? await getToken()
    : await getToken({ template: "convex" })

  if (!token) {
    throw new Error("Clerk did not return a Convex authentication token")
  }

  return token
}

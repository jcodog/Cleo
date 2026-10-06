// Segment boundaries keep public routes such as /dashboard-guide on the site.
const productRoots = [
  "/dashboard",
  "/onboarding",
  "/twitch",
  "/kick",
  "/staff",
  "/account",
  "/settings",
  "/billing",
  "/subscription",
]
const authRoots = ["/sign-in", "/sign-up", "/sso-callback", "/session-tasks"]

function matchesRoot(pathname: string, roots: string[]): boolean {
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  )
}

export function isProtectedAppPath(pathname: string): boolean {
  return matchesRoot(pathname, productRoots)
}

export function isLegacyAppPath(pathname: string): boolean {
  return isProtectedAppPath(pathname) || matchesRoot(pathname, authRoots)
}

export function legacyAppRedirect(
  requestUrl: string,
  appOrigin: string
): URL | null {
  const request = new URL(requestUrl)
  if (!isLegacyAppPath(request.pathname)) return null
  const destination = new URL(appOrigin)
  destination.pathname = request.pathname
  destination.search = request.search
  return destination
}

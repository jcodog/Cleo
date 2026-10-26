export function mobileSessionState(
  loaded: boolean,
  signedIn: boolean | undefined,
  convexLoading: boolean,
  authenticated: boolean
) {
  if (!loaded) return "restoring"
  if (!signedIn) return "signedOut"
  if (convexLoading) return "connecting"
  return authenticated ? "ready" : "backendUnavailable"
}

export function directoryNotice(
  status: "ready" | "pending" | "expired" | "unavailable" | "missingDiscord"
) {
  switch (status) {
    case "ready":
      return ""
    case "pending":
      return "Verifying your Discord permissions. Your last-known servers stay visible."
    case "expired":
      return "Discord verification has expired. Pull to refresh. Server access is restricted until verified."
    case "missingDiscord":
      return "Connect Discord in your Cleo account, then pull to refresh."
    case "unavailable":
      return "Discord verification is unavailable. Pull to try again. Listed servers reflect your last verified access."
  }
}

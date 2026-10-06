type WebOriginOptions = {
  configuredUrl: string | undefined
  vercelUrl?: string
  vercelEnv?: string
  allowVercelUrl?: boolean
  variableName?: string
  localOrigin: string
}

// A deployment's own VERCEL_URL is only suitable for that app's origin.
// Cross-app preview links need the other project's explicit URL.
export function resolveWebOrigin({
  configuredUrl,
  vercelUrl,
  vercelEnv,
  allowVercelUrl = true,
  variableName = "web origin",
  localOrigin,
}: WebOriginOptions): string {
  const deployed = Boolean(vercelEnv || vercelUrl)
  const selected =
    configuredUrl ||
    (allowVercelUrl && vercelEnv !== "production" && vercelUrl
      ? `https://${vercelUrl}`
      : undefined)
  if (!selected && deployed) {
    throw new Error(`${variableName} must be configured for this deployment`)
  }
  const url = new URL(selected || localOrigin)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (deployed &&
      (url.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  ) {
    throw new Error(
      `${variableName} must be a valid public HTTPS origin for deployments`
    )
  }
  return url.origin
}

type WebOriginOptions = {
  configuredUrl: string | undefined
  vercelUrl?: string
  localOrigin: string
}

// A deployment's own VERCEL_URL is only suitable for that app's origin.
// Cross-app preview links need the other project's explicit URL.
export function resolveWebOrigin({
  configuredUrl,
  vercelUrl,
  localOrigin,
}: WebOriginOptions): string {
  return new URL(
    configuredUrl || (vercelUrl ? `https://${vercelUrl}` : localOrigin)
  ).origin
}

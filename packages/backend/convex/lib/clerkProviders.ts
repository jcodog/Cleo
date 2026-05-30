export type ClerkLinkedProvider = "discord" | "kick" | "twitch" | "github"

export function getClerkLinkedProvider(
  provider: string | null | undefined
): ClerkLinkedProvider | null {
  if (provider === null || provider === undefined) {
    return null
  }

  const normalized = provider.startsWith("oauth_")
    ? provider.slice("oauth_".length)
    : provider

  if (normalized === "custom_kick") {
    return "kick"
  }

  switch (normalized) {
    case "discord":
    case "kick":
    case "twitch":
    case "github":
      return normalized
    default:
      return null
  }
}

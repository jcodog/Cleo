import type { GuildOverview } from "../types"

export function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return "Not Synced"
  }

  return new Intl.NumberFormat(undefined).format(value)
}

export function formatDateTime(value: number | undefined): string {
  if (value === undefined) {
    return "Not Synced"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function toTitleCase(value: string): string {
  return value
    .split(/[.\-_ ]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

export function getBotStatusLabel(
  isBotLeft: boolean,
  overview: GuildOverview
): string {
  if (isBotLeft) {
    return "Bot Left"
  }

  if (overview.botJoinedAt === undefined) {
    return "Runtime Pending"
  }

  return "Ready"
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Try again or refresh this workspace."
}

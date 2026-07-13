import { escapeMarkdown } from "discord.js"

import type {
  DiscordGuildRuntimeConfig,
  DiscordGuildRuntimeConfigDisabledReason,
  DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"

export const CLEO_DASHBOARD_BASE_URL = "https://beta.cleoai.cloud"

type GuildStatusMessageInput = {
  discordGuildId: string
  guildName: string
  result: DiscordGuildRuntimeConfigResult
  dashboardBaseUrl?: string
}

type DisabledStatusDescription = {
  state: string
  detail: string
  moduleState: string
}

export function buildCleoGuildDashboardUrl(
  discordGuildId: string,
  dashboardBaseUrl = CLEO_DASHBOARD_BASE_URL
): string {
  const dashboardUrl = new URL(
    `/dashboard/${encodeURIComponent(discordGuildId)}`,
    dashboardBaseUrl
  )

  dashboardUrl.search = ""
  dashboardUrl.hash = ""

  return dashboardUrl.toString()
}

export function buildCleoGuildStatusMessage({
  discordGuildId,
  guildName,
  result,
  dashboardBaseUrl,
}: GuildStatusMessageInput): string {
  const dashboardUrl = buildCleoGuildDashboardUrl(
    discordGuildId,
    dashboardBaseUrl
  )
  const heading = `**Cleo status · ${escapeMarkdown(guildName)}**`

  if (result.status === "ready") {
    return [
      heading,
      "Configuration: **Active**",
      ...formatReadyModules(result.config),
      "",
      `Manage Cleo: <${dashboardUrl}>`,
    ].join("\n")
  }

  const disabled = describeDisabledStatus(result.reason)

  return [
    heading,
    `Configuration: **${disabled.state}**`,
    `Moderation: ${disabled.moduleState}`,
    `Welcome: ${disabled.moduleState}`,
    `Logging: ${disabled.moduleState}`,
    `Support: ${disabled.moduleState}`,
    "",
    disabled.detail,
    `Manage Cleo: <${dashboardUrl}>`,
  ].join("\n")
}

function formatReadyModules(config: DiscordGuildRuntimeConfig): string[] {
  return [
    `Moderation: ${formatEnabled(config.moderationEnabled)}`,
    `Welcome: ${formatEnabled(config.welcomeEnabled)}`,
    `Logging: ${formatLogging(config)}`,
    `Support: ${formatEnabled(config.supportEnabled)}`,
  ]
}

function formatEnabled(enabled: boolean): "Enabled" | "Disabled" {
  return enabled ? "Enabled" : "Disabled"
}

function formatLogging(config: DiscordGuildRuntimeConfig): string {
  if (!config.loggingEnabled) {
    return "Disabled"
  }

  if (!config.logLevel || config.logLevel === "none") {
    return "Enabled"
  }

  return `Enabled · ${capitalize(config.logLevel)}`
}

function describeDisabledStatus(
  reason: DiscordGuildRuntimeConfigDisabledReason
): DisabledStatusDescription {
  switch (reason) {
    case "missingConfig":
      return {
        state: "Needs setup",
        moduleState: "Not configured",
        detail: "Finish this server's Cleo setup in the dashboard.",
      }
    case "unknownGuild":
      return {
        state: "Not connected",
        moduleState: "Not configured",
        detail: "Add this server to the Cleo dashboard to configure its services.",
      }
    case "botLeft":
      return {
        state: "Reconnecting",
        moduleState: "Unavailable",
        detail:
          "Cleo is online here, but the control plane has not reconciled this server yet. Try again shortly.",
      }
    case "convexUnavailable":
    case "invalidBackendResponse":
    case "invalidGuildId":
      return {
        state: "Temporarily unavailable",
        moduleState: "Unavailable",
        detail:
          "Cleo could not verify this server's settings. Try again shortly or use the dashboard.",
      }
  }
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

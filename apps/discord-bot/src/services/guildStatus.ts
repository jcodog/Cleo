import { escapeMarkdown } from "discord.js"

import type {
  DiscordGuildRuntimeConfig,
  DiscordGuildRuntimeConfigDisabledReason,
  DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"

export const CLEO_DASHBOARD_BASE_URL = "https://beta.cleoai.cloud"

export type CleoGuildStatusView = {
  content: string
  dashboardUrl: string
}

type GuildStatusViewInput = {
  discordGuildId: string
  guildName: string
  result: DiscordGuildRuntimeConfigResult
  dashboardBaseUrl?: string
}

export function buildCleoGuildDashboardUrl(
  discordGuildId: string,
  dashboardBaseUrl = CLEO_DASHBOARD_BASE_URL
): string {
  const dashboardUrl = new URL(dashboardBaseUrl)

  if (dashboardUrl.protocol !== "https:") {
    throw new Error("Cleo dashboard URL must use HTTPS.")
  }

  dashboardUrl.pathname = `/dashboard/${encodeURIComponent(discordGuildId)}`
  dashboardUrl.search = ""
  dashboardUrl.hash = ""

  return dashboardUrl.toString()
}

export function buildCleoGuildStatusView({
  discordGuildId,
  guildName,
  result,
  dashboardBaseUrl,
}: GuildStatusViewInput): CleoGuildStatusView {
  const dashboardUrl = buildCleoGuildDashboardUrl(
    discordGuildId,
    dashboardBaseUrl
  )
  const heading = `## Cleo status · ${escapeMarkdown(guildName)}`

  if (result.status === "disabled") {
    return {
      content: formatDisabledStatus(heading, result.reason),
      dashboardUrl,
    }
  }

  return {
    content: formatReadyStatus(heading, result.config),
    dashboardUrl,
  }
}

function formatReadyStatus(
  heading: string,
  config: DiscordGuildRuntimeConfig
): string {
  return [
    heading,
    "Configuration is connected and loaded from Cleo.",
    "",
    formatModuleLine("Moderation", config.moderationEnabled, true),
    formatModuleLine(
      "Welcome",
      config.welcomeEnabled,
      Boolean(config.welcomeChannelId),
      config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : undefined
    ),
    formatModuleLine(
      "Logging",
      config.loggingEnabled,
      Boolean(config.logChannelId || config.modLogChannelId),
      config.logLevel && config.logLevel !== "none"
        ? `${capitalize(config.logLevel)} detail`
        : undefined
    ),
    formatModuleLine(
      "Support",
      config.supportEnabled,
      Boolean(
        config.supportTargetId &&
          config.supportTargetType &&
          config.supportStaffRoleIds?.length
      ),
      config.supportTargetId ? `<#${config.supportTargetId}>` : undefined
    ),
    "",
    "Use the dashboard to change settings or finish any incomplete setup.",
  ].join("\n")
}

function formatDisabledStatus(
  heading: string,
  reason: DiscordGuildRuntimeConfigDisabledReason
): string {
  switch (reason) {
    case "missingConfig":
      return [
        heading,
        "⚠️ **Setup is incomplete**",
        "",
        "Cleo is installed, but this server does not have an active configuration yet.",
        "Use the dashboard to finish setup before enabling config-driven features.",
      ].join("\n")
    case "unknownGuild":
      return [
        heading,
        "⚠️ **Server is not connected**",
        "",
        "Cleo could not find this server in the control plane.",
        "Use the dashboard to connect the server and create its configuration.",
      ].join("\n")
    case "botLeft":
      return [
        heading,
        "⚠️ **Installation needs attention**",
        "",
        "Cleo's saved state says the bot is no longer installed in this server.",
        "Open the dashboard to repair or reinstall the connection.",
      ].join("\n")
    case "convexUnavailable":
      return [
        heading,
        "⚠️ **Configuration service is temporarily unavailable**",
        "",
        "Cleo could not verify this server's settings right now. Config-driven features remain safely disabled unless a valid cached configuration is available.",
        "Try again shortly or use the dashboard to check the service state.",
      ].join("\n")
    case "invalidBackendResponse":
      return [
        heading,
        "⚠️ **Configuration was disabled for safety**",
        "",
        "Cleo received a configuration response it could not validate and did not apply it.",
        "Use the dashboard to review the server configuration.",
      ].join("\n")
    case "invalidGuildId":
      return [
        heading,
        "⚠️ **This server could not be identified**",
        "",
        "Cleo could not safely load configuration for this server.",
      ].join("\n")
  }
}

function formatModuleLine(
  label: string,
  enabled: boolean,
  configured: boolean,
  detail?: string
): string {
  if (!enabled) {
    return `◻️ **${label}** · Off`
  }

  if (!configured) {
    return `⚠️ **${label}** · On, setup incomplete`
  }

  return `✅ **${label}** · On${detail ? ` · ${detail}` : ""}`
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

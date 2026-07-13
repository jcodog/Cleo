import type {
  DiscordGuildRuntimeConfig,
  DiscordGuildRuntimeConfigDisabledReason,
  DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"

export const DEFAULT_CLEO_DASHBOARD_URL = "https://beta.cleoai.cloud"

export type CleoGuildStatusView = {
  content: string
  dashboardUrl: string
}

export function buildCleoGuildStatusView(
  discordGuildId: string,
  result: DiscordGuildRuntimeConfigResult,
  dashboardBaseUrl: string = DEFAULT_CLEO_DASHBOARD_URL
): CleoGuildStatusView {
  const dashboardUrl = buildCleoGuildDashboardUrl(
    discordGuildId,
    dashboardBaseUrl
  )

  if (result.status === "disabled") {
    return {
      content: formatDisabledStatus(result.reason),
      dashboardUrl,
    }
  }

  return {
    content: formatReadyStatus(result.config),
    dashboardUrl,
  }
}

export function buildCleoGuildDashboardUrl(
  discordGuildId: string,
  dashboardBaseUrl: string = DEFAULT_CLEO_DASHBOARD_URL
): string {
  const baseUrl = new URL(dashboardBaseUrl)

  if (baseUrl.protocol !== "https:") {
    throw new Error("Cleo dashboard URL must use HTTPS.")
  }

  baseUrl.pathname = `/dashboard/${encodeURIComponent(discordGuildId)}`
  baseUrl.search = ""
  baseUrl.hash = ""

  return baseUrl.toString()
}

function formatReadyStatus(config: DiscordGuildRuntimeConfig): string {
  return [
    "## Cleo server status",
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
  reason: DiscordGuildRuntimeConfigDisabledReason
): string {
  switch (reason) {
    case "unknownGuild":
    case "missingConfig":
      return [
        "## Cleo server status",
        "⚠️ **Setup is incomplete**",
        "",
        "Cleo is installed, but this server does not have an active configuration yet.",
        "Use the dashboard to finish setup before enabling config-driven features.",
      ].join("\n")
    case "botLeft":
      return [
        "## Cleo server status",
        "⚠️ **Installation needs attention**",
        "",
        "Cleo's saved configuration says the bot is no longer installed in this server.",
        "Open the dashboard to repair or reinstall the connection.",
      ].join("\n")
    case "convexUnavailable":
      return [
        "## Cleo server status",
        "⚠️ **Configuration service is temporarily unavailable**",
        "",
        "Cleo could not verify this server's settings right now. Config-driven features remain safely disabled unless a valid cached configuration is available.",
        "Try again shortly or use the dashboard to check the service state.",
      ].join("\n")
    case "invalidBackendResponse":
      return [
        "## Cleo server status",
        "⚠️ **Configuration was disabled for safety**",
        "",
        "Cleo received a configuration response it could not validate and did not apply it.",
        "Use the dashboard to review the server configuration.",
      ].join("\n")
    case "invalidGuildId":
      return [
        "## Cleo server status",
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

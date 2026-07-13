import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js"

import { Command } from "@/classes/Command"
import {
  buildCleoGuildStatusView,
  DEFAULT_CLEO_DASHBOARD_URL,
} from "@/services/cleoGuildStatus"
import {
  fetchDiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"
import { botLogError } from "@/utils/botLog"

type CleoCommandOptions = {
  fetchRuntimeConfig?: (
    discordGuildId: string
  ) => Promise<DiscordGuildRuntimeConfigResult>
  dashboardBaseUrl?: string
}

export function createCleoCommand({
  fetchRuntimeConfig = fetchDiscordGuildRuntimeConfig,
  dashboardBaseUrl = DEFAULT_CLEO_DASHBOARD_URL,
}: CleoCommandOptions = {}): Command {
  return new Command({
    data: {
      name: "cleo",
      description: "Inspect and manage Cleo for this server",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild],
      options: [
        {
          name: "status",
          description: "Check Cleo's configured services for this server",
          type: ApplicationCommandOptionType.Subcommand,
        },
      ],
    },
    async execute({ interaction }) {
      const discordGuildId = interaction.guildId

      if (!discordGuildId) {
        await interaction.reply({
          content: "This command can only be used inside a Discord server.",
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      let result: DiscordGuildRuntimeConfigResult

      try {
        result = await fetchRuntimeConfig(discordGuildId)
      } catch (error) {
        botLogError("Cleo status command could not load guild config.", error, {
          commandName: "cleo",
          discordGuildId,
        })
        result = {
          status: "disabled",
          reason: "convexUnavailable",
        }
      }

      const view = buildCleoGuildStatusView(
        discordGuildId,
        result,
        dashboardBaseUrl
      )
      const dashboardButton = new ButtonBuilder()
        .setLabel("Open Cleo dashboard")
        .setStyle(ButtonStyle.Link)
        .setURL(view.dashboardUrl)
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        dashboardButton
      )

      await interaction.reply({
        content: view.content,
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      })
    },
  })
}

export default createCleoCommand()

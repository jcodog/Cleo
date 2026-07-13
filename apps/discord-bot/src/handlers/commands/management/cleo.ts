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
  fetchDiscordGuildRuntimeConfig,
  type DiscordGuildRuntimeConfigResult,
} from "@/services/guildRuntimeConfig"
import {
  buildCleoGuildStatusView,
  CLEO_DASHBOARD_BASE_URL,
} from "@/services/guildStatus"
import { botLogError } from "@/utils/botLog"

type RuntimeConfigReader = (
  discordGuildId: string
) => Promise<DiscordGuildRuntimeConfigResult>

type CleoCommandOptions = {
  fetchRuntimeConfig?: RuntimeConfigReader
  dashboardBaseUrl?: string
}

const MANAGE_GUILD_REQUIRED_MESSAGE =
  "You need the Manage Server permission to inspect Cleo's configuration."
const GUILD_ONLY_MESSAGE = "This command can only be used inside a server."

export function createCleoCommand({
  fetchRuntimeConfig = fetchDiscordGuildRuntimeConfig,
  dashboardBaseUrl = CLEO_DASHBOARD_BASE_URL,
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
          type: ApplicationCommandOptionType.Subcommand,
          name: "status",
          description: "Check Cleo's configured services for this server",
        },
      ],
    },
    async execute({ interaction }) {
      if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
          content: GUILD_ONLY_MESSAGE,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        })
        return
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: MANAGE_GUILD_REQUIRED_MESSAGE,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        })
        return
      }

      if (interaction.options.getSubcommand() !== "status") {
        await interaction.reply({
          content: "That Cleo command is not available.",
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        })
        return
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      let result: DiscordGuildRuntimeConfigResult

      try {
        result = await fetchRuntimeConfig(interaction.guildId)
      } catch (error) {
        botLogError("Cleo status runtime configuration fetch failed.", error, {
          commandName: "cleo",
          discordGuildId: interaction.guildId,
        })
        result = {
          status: "disabled",
          reason: "convexUnavailable",
        }
      }

      const view = buildCleoGuildStatusView({
        discordGuildId: interaction.guildId,
        guildName: interaction.guild?.name ?? "This server",
        result,
        dashboardBaseUrl,
      })
      const dashboardButton = new ButtonBuilder()
        .setLabel("Open Cleo dashboard")
        .setStyle(ButtonStyle.Link)
        .setURL(view.dashboardUrl)
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        dashboardButton
      )

      await interaction.editReply({
        content: view.content,
        components: [actionRow],
        allowedMentions: { parse: [] },
      })
    },
  })
}

export default createCleoCommand()

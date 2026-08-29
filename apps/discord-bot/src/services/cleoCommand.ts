import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js"

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

type CleoCommandDependencies = {
  fetchRuntimeConfig?: RuntimeConfigReader
  dashboardBaseUrl?: string
}

const MANAGE_GUILD_REQUIRED_MESSAGE =
  "You need the Manage Server permission to inspect Cleo's configuration."
const GUILD_ONLY_MESSAGE = "This command can only be used inside a server."

export async function handleCleoCommand(
  interaction: ChatInputCommandInteraction,
  {
    fetchRuntimeConfig = fetchDiscordGuildRuntimeConfig,
    dashboardBaseUrl = CLEO_DASHBOARD_BASE_URL,
  }: CleoCommandDependencies = {}
): Promise<void> {
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

  await interaction.editReply({
    content: view.content,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            label: "Open Cleo dashboard",
            url: view.dashboardUrl,
          },
        ],
      },
    ],
    allowedMentions: { parse: [] },
  })
}

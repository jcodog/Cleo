import { botLogError } from "@/utils/botLog"
import {
  reportDiscordRuntimeError,
  type DiscordRuntimeErrorReporter,
} from "@/services/runtimeErrorReporter"
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js"

type ReplyWithCommandErrorOptions = {
  interaction: ChatInputCommandInteraction
  error: unknown
  reportRuntimeError?: DiscordRuntimeErrorReporter
}

export async function replyWithCommandError({
  interaction,
  error,
  reportRuntimeError = reportDiscordRuntimeError,
}: ReplyWithCommandErrorOptions): Promise<void> {
  const operation = "executeSlashCommand"
  const context = {
    commandName: interaction.commandName,
    interactionId: interaction.id,
    discordGuildId: interaction.guildId,
    discordChannelId: interaction.channelId,
    discordUserId: interaction.user.id,
  }

  botLogError(`Command failed: /${interaction.commandName}`, error, context)

  const content = "Something went wrong while running that command."

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content })
    } else {
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      })
    }
  } catch (replyError) {
    botLogError(
      `Failed to send command error response for /${interaction.commandName}`,
      replyError,
      context
    )
  }

  try {
    await reportRuntimeError({
      severity: "error",
      serviceArea: "command",
      message: "Discord slash command execution failed.",
      error,
      discordGuildId: interaction.guildId ?? undefined,
      commandName: interaction.commandName,
      operation,
      fingerprint: `command:${operation}:${interaction.commandName}`,
      metadata: {
        operation,
        interactionId: interaction.id,
        discordChannelId: interaction.channelId,
      },
    })
  } catch (reportError) {
    botLogError("Discord command runtime error report failed.", reportError, {
      commandName: interaction.commandName,
      interactionId: interaction.id,
      discordGuildId: interaction.guildId,
      operation,
    })
  }
}

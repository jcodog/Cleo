import { botLogError } from "@/utils/botLog"
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js"

type ReplyWithCommandErrorOptions = {
  interaction: ChatInputCommandInteraction
  error: unknown
}

export async function replyWithCommandError({
  interaction,
  error,
}: ReplyWithCommandErrorOptions): Promise<void> {
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
      return
    }

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    })
  } catch (replyError) {
    botLogError(
      `Failed to send command error response for /${interaction.commandName}`,
      replyError,
      context
    )
  }
}

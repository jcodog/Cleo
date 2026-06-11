import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
} from "discord.js"

import { Command } from "@/classes/Command"

export default new Command({
  data: {
    name: "ping",
    description: "Check whether Cleo is responding",
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
    contexts: [
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ],
  },
  async execute({ interaction }) {
    const receivedAt = Date.now()
    const gatewayDispatchLatency = receivedAt - interaction.createdTimestamp

    const replyStartedAt = performance.now()

    await interaction.reply({
      content: "Pinging...",
      flags: MessageFlags.Ephemeral,
    })

    const replyRestLatency = Math.round(performance.now() - replyStartedAt)
    const totalLatency = Date.now() - interaction.createdTimestamp

    const rawGatewayHeartbeat = Math.round(interaction.client.ws.ping)

    const gatewayHeartbeat =
      rawGatewayHeartbeat >= 0 ? `${rawGatewayHeartbeat}ms` : "Calculating..."

    await interaction.editReply(
      [
        "Pong!",
        "",
        `Gateway dispatch: \`${gatewayDispatchLatency}ms\``,
        `Reply REST latency: \`${replyRestLatency}ms\``,
        `Total interaction latency: \`${totalLatency}ms\``,
        `Gateway heartbeat: \`${gatewayHeartbeat}\``,
      ].join("\n")
    )
  },
})

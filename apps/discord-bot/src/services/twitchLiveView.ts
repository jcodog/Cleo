import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  escapeMarkdown,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageCreateOptions,
} from "discord.js"
import { createHash } from "node:crypto"

export type TwitchLiveView = {
  deliveryId: string
  login: string
  displayName: string
  title?: string
  category?: string
  startedAt: string
  mentionMode: "none" | "everyone" | "role"
  roleId?: string
}

function safeText(value: string, limit: number): string {
  // Twitch text must not retain Discord control characters.
  return escapeMarkdown(
    value
      .slice(0, limit)
      // oxlint-disable-next-line eslint/no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replaceAll("@", "@\u200b")
      .replaceAll("<", "‹")
      .replaceAll(">", "›")
  )
}

export function buildTwitchLiveView(
  view: TwitchLiveView
): MessageCreateOptions {
  if (!/^[a-z0-9_]{1,25}$/.test(view.login))
    throw new Error("Invalid verified Twitch login.")
  if (
    view.mentionMode === "role" &&
    (!view.roleId || !/^\d{17,20}$/.test(view.roleId))
  )
    throw new Error("Invalid notification role.")
  const mention =
    view.mentionMode === "everyone"
      ? "@everyone\n"
      : view.mentionMode === "role"
        ? `<@&${view.roleId}>\n`
        : ""
  const container = new ContainerBuilder()
    .setAccentColor(0x06b6d4)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${mention}## LIVE · ${safeText(view.displayName, 100)}\nThe server owner's Twitch channel is live.`
      )
    )
  if (view.title)
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${safeText(view.title, 500)}`)
    )
  if (view.category)
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Playing ${safeText(view.category, 100)}`
      )
    )
  const start = Date.parse(view.startedAt)
  if (Number.isFinite(start))
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Started <t:${Math.floor(start / 1000)}:R>`
      )
    )
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Watch stream")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://www.twitch.tv/${view.login}`)
      )
    )
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: {
      parse: view.mentionMode === "everyone" ? ["everyone"] : [],
      roles: view.mentionMode === "role" && view.roleId ? [view.roleId] : [],
      users: [],
      repliedUser: false,
    },
    nonce: createHash("sha256")
      .update(view.deliveryId)
      .digest("hex")
      .slice(0, 24),
    enforceNonce: true,
  }
}

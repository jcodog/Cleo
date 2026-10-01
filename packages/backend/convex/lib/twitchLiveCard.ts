"use node"
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  escapeMarkdown,
} from "discord.js"
import { createHash } from "node:crypto"
import { normalizeChatText } from "@workspace/shared/twitchEventSub"

export type TwitchLiveCard = {
  deliveryId: string
  login: string
  displayName: string
  title?: string
  category?: string
  startedAt: string
  avatarUrl?: string
  previewUrl?: string
  viewerCount?: number
  mentionMode: "none" | "everyone" | "role"
  roleId?: string
}
function safeText(value: string, limit: number) {
  return escapeMarkdown(
    [...normalizeChatText(value)]
      .slice(0, limit)
      .map((character) => {
        const code = character.codePointAt(0)!
        return code < 32 || (code >= 127 && code <= 159) ? " " : character
      })
      .join("")
      .replaceAll("@", "@\u200b")
      .replaceAll("<", "‹")
      .replaceAll(">", "›")
  )
}
function mediaUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "static-cdn.jtvnw.net" ||
        url.hostname.endsWith(".jtvnw.net"))
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}
export function buildTwitchLiveCard(view: TwitchLiveCard) {
  if (!/^[a-z0-9_]{1,25}$/.test(view.login))
    throw new Error("Invalid Twitch login.")
  if (
    view.mentionMode === "role" &&
    (!view.roleId || !/^\d{17,20}$/.test(view.roleId))
  )
    throw new Error("Invalid notification role.")
  const heading = new TextDisplayBuilder().setContent(
    `## ${safeText(view.displayName, 100)} is live on Twitch\n${view.category ? `Playing ${safeText(view.category, 100)}\n` : ""}twitch.tv/${view.login}`
  )
  const container = new ContainerBuilder().setAccentColor(0x9146ff)
  const avatar = mediaUrl(view.avatarUrl)
  if (avatar)
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(heading)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar))
    )
  else container.addTextDisplayComponents(heading)
  if (view.title)
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${safeText(view.title, 500)}`)
    )
  const preview = mediaUrl(
    view.previewUrl?.replaceAll("{width}", "640").replaceAll("{height}", "360")
  )
  if (preview)
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(preview)
          .setDescription("Live Twitch stream preview")
      )
    )
  const started = Date.parse(view.startedAt)
  const facts = [
    Number.isFinite(started)
      ? `Started <t:${Math.floor(started / 1000)}:R>`
      : undefined,
    view.viewerCount !== undefined &&
    Number.isSafeInteger(view.viewerCount) &&
    view.viewerCount >= 0
      ? `${view.viewerCount.toLocaleString("en-US")} viewers`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
  if (facts)
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(facts)
    )
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Watch on Twitch ↗")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://www.twitch.tv/${view.login}`)
      )
    )
  const mention =
    view.mentionMode === "everyone"
      ? "@everyone"
      : view.mentionMode === "role"
        ? `<@&${view.roleId}>`
        : undefined
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      ...(mention
        ? [new TextDisplayBuilder().setContent(mention).toJSON()]
        : []),
      container.toJSON(),
    ],
    allowed_mentions: {
      parse: view.mentionMode === "everyone" ? ["everyone"] : [],
      roles: view.mentionMode === "role" && view.roleId ? [view.roleId] : [],
      users: [],
      replied_user: false,
    },
    nonce: createHash("sha256")
      .update(view.deliveryId)
      .digest("hex")
      .slice(0, 24),
    enforce_nonce: true,
  }
}

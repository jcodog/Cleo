import { createCanvas, loadImage } from "@napi-rs/canvas"
import type { GuildMember, MessageCreateOptions } from "discord.js"
import {
  drawWelcomeCard,
  welcomeCardText,
  type WelcomeCardCopy,
} from "@workspace/shared/drawWelcomeCard"
import {
  DEFAULT_WELCOME_SUBTEXT,
  FREE_WELCOME_STYLE,
  WELCOME_CARD_SIZE,
  cleanWelcomeText,
  welcomeGraphemes,
  welcomeTextTokens,
  parseWelcomeCardStyle,
  type WelcomeCardStyle,
} from "@workspace/shared/welcomeCard"
import {
  loadWelcomeEmojiAssets,
  registerWelcomeFonts,
} from "./welcomeCardAssets"

export { DEFAULT_WELCOME_SUBTEXT } from "@workspace/shared/welcomeCard"
type WelcomeAvatarLoader = (
  source: string,
  options: { maxRedirects: number }
) => ReturnType<typeof loadImage>
export async function loadWelcomeAvatar(
  avatarUrl: string,
  loader: WelcomeAvatarLoader = loadImage
): Promise<Awaited<ReturnType<typeof loadImage>> | null> {
  try {
    return await loader(avatarUrl, { maxRedirects: 3 })
  } catch {
    return null
  }
}

// Preview/fixture PNGs can explore Premium styling. Production delivery always
// uses FREE_WELCOME_STYLE until JCN-57 supplies a verified guild entitlement.
export async function renderWelcomeCardPng(
  copy: WelcomeCardCopy,
  style: WelcomeCardStyle = FREE_WELCOME_STYLE,
  avatarUrl?: string
): Promise<Buffer> {
  registerWelcomeFonts()
  const validatedStyle = parseWelcomeCardStyle(style)
  const text = welcomeCardText(copy, validatedStyle)
  const initial = welcomeGraphemes(cleanWelcomeText(copy.member))[0] ?? "C"
  const [assets, avatar] = await Promise.all([
    loadWelcomeEmojiAssets([
      ...text.title,
      ...text.subtext,
      ...welcomeTextTokens(initial),
    ]),
    avatarUrl ? loadWelcomeAvatar(avatarUrl) : Promise.resolve(null),
  ])
  const canvas = createCanvas(WELCOME_CARD_SIZE.width, WELCOME_CARD_SIZE.height)
  const context = canvas.getContext("2d")
  drawWelcomeCard(
    context,
    copy,
    (key, x, y, size) => {
      const image = key === "avatar" ? avatar : assets.get(key)
      if (!image) return false
      context.drawImage(image, x, y, size, size)
      return true
    },
    validatedStyle
  )
  return await canvas.encode("png")
}

export async function renderWelcomeCardMessage(
  member: GuildMember,
  options: { subtext?: string } = {}
): Promise<MessageCreateOptions> {
  const avatarUrl =
    typeof member.displayAvatarURL === "function"
      ? member.displayAvatarURL({
          extension: "png",
          size: 256,
          forceStatic: true,
        })
      : typeof member.user.displayAvatarURL === "function"
        ? member.user.displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          })
        : undefined
  const attachment = await renderWelcomeCardPng(
    {
      member: member.displayName || member.user.username || "new member",
      server: member.guild.name,
      subtext: options.subtext ?? DEFAULT_WELCOME_SUBTEXT,
    },
    FREE_WELCOME_STYLE,
    avatarUrl
  )
  return {
    content: `Welcome <@${member.id}> to ${member.guild.name}`,
    allowedMentions: { users: [member.id], roles: [], parse: [] },
    files: [{ attachment, name: "cleo-welcome.png" }],
  }
}

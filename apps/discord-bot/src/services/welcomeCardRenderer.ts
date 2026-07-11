import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas"
import type { GuildMember, MessageCreateOptions } from "discord.js"

const cardWidth = 960
const cardHeight = 360
const avatarSize = 170
const attachmentName = "cleo-welcome.png"
export const DEFAULT_WELCOME_SUBTEXT =
  "Settle in, say hello, and enjoy the server."

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

export async function renderWelcomeCardMessage(
  member: GuildMember,
  options: {
    subtext?: string
  } = {}
): Promise<MessageCreateOptions> {
  const canvas = createCanvas(cardWidth, cardHeight)
  const context = canvas.getContext("2d")

  drawBackground(context)
  await drawAvatar(context, member)
  drawCopy(context, member, options.subtext ?? DEFAULT_WELCOME_SUBTEXT)

  const attachment = await canvas.encode("png")

  return {
    content: buildWelcomeContent(member),
    allowedMentions: {
      users: [member.id],
      roles: [],
      parse: [],
    },
    files: [
      {
        attachment,
        name: attachmentName,
      },
    ],
  }
}

function drawBackground(context: SKRSContext2D): void {
  const gradient = context.createLinearGradient(0, 0, cardWidth, cardHeight)
  gradient.addColorStop(0, "#071013")
  gradient.addColorStop(0.48, "#102126")
  gradient.addColorStop(1, "#111827")

  context.fillStyle = gradient
  context.fillRect(0, 0, cardWidth, cardHeight)

  drawGlow(context, 760, 34, 210, "rgba(34, 211, 238, 0.28)")
  drawGlow(context, 850, 308, 220, "rgba(217, 70, 239, 0.18)")
  drawGlow(context, 118, 36, 190, "rgba(16, 185, 129, 0.12)")

  context.strokeStyle = "rgba(148, 163, 184, 0.2)"
  context.lineWidth = 2
  roundRect(context, 18, 18, cardWidth - 36, cardHeight - 36, 28)
  context.stroke()
}

function drawGlow(
  context: SKRSContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius)
  glow.addColorStop(0, color)
  glow.addColorStop(1, "rgba(0, 0, 0, 0)")
  context.fillStyle = glow
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

async function drawAvatar(
  context: SKRSContext2D,
  member: GuildMember
): Promise<void> {
  const x = 72
  const y = 94
  const avatarUrl = getMemberAvatarUrl(member)

  context.save()
  context.shadowColor = "rgba(34, 211, 238, 0.45)"
  context.shadowBlur = 26
  context.fillStyle = "#22d3ee"
  context.beginPath()
  context.arc(
    x + avatarSize / 2,
    y + avatarSize / 2,
    avatarSize / 2 + 5,
    0,
    Math.PI * 2
  )
  context.fill()
  context.restore()

  context.save()
  context.beginPath()
  context.arc(
    x + avatarSize / 2,
    y + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2
  )
  context.clip()

  if (avatarUrl) {
    const avatar = await loadWelcomeAvatar(avatarUrl)

    if (avatar) {
      context.drawImage(avatar, x, y, avatarSize, avatarSize)
    } else {
      drawFallbackAvatar(context, member, x, y)
    }
  } else {
    drawFallbackAvatar(context, member, x, y)
  }

  context.restore()
}

function drawFallbackAvatar(
  context: SKRSContext2D,
  member: GuildMember,
  x: number,
  y: number
): void {
  const fallback = context.createLinearGradient(
    x,
    y,
    x + avatarSize,
    y + avatarSize
  )
  fallback.addColorStop(0, "#0891b2")
  fallback.addColorStop(1, "#7c3aed")
  context.fillStyle = fallback
  context.fillRect(x, y, avatarSize, avatarSize)

  context.fillStyle = "#ecfeff"
  context.font = "700 58px sans-serif"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText(
    getAvatarInitial(member),
    x + avatarSize / 2,
    y + avatarSize / 2 + 2
  )
}

function drawCopy(
  context: SKRSContext2D,
  member: GuildMember,
  subtext: string
): void {
  const displayName = sanitizeDisplayText(
    member.displayName || member.user.username || "new member"
  )
  context.fillStyle = "rgba(236, 254, 255, 0.72)"
  context.font = "700 30px sans-serif"
  context.textAlign = "left"
  context.textBaseline = "alphabetic"
  context.fillText("WELCOME", 292, 118)

  context.fillStyle = "#f8fafc"
  context.font = "800 64px sans-serif"
  fillFittedText(context, `Welcome, ${displayName}`, 292, 196, 560, 64)

  context.fillStyle = "rgba(226, 232, 240, 0.86)"
  context.font = "600 32px sans-serif"
  fillFittedText(context, sanitizeDisplayText(subtext), 292, 258, 560, 32)
}

function fillFittedText(
  context: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number
): void {
  let currentFontSize = fontSize

  while (context.measureText(text).width > maxWidth && currentFontSize > 18) {
    currentFontSize -= 2
    context.font = context.font.replace(/\d+px/, `${currentFontSize}px`)
  }

  context.fillText(text, x, y)
}

function getMemberAvatarUrl(member: GuildMember): string | null {
  if (typeof member.displayAvatarURL === "function") {
    return member.displayAvatarURL({
      extension: "png",
      size: 256,
      forceStatic: true,
    })
  }

  if (typeof member.user.displayAvatarURL === "function") {
    return member.user.displayAvatarURL({
      extension: "png",
      size: 256,
      forceStatic: true,
    })
  }

  return null
}

function getAvatarInitial(member: GuildMember): string {
  const name = member.displayName || member.user.username || "C"
  return sanitizeDisplayText(name).slice(0, 1).toUpperCase() || "C"
}

function sanitizeDisplayText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function buildWelcomeContent(member: GuildMember): string {
  return `Welcome <@${member.id}> to ${member.guild.name}`
}

function roundRect(
  context: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height
  )
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

import {
  cleanWelcomeText,
  fitWelcomeText,
  FREE_WELCOME_STYLE,
  WELCOME_CARD_SIZE,
  WELCOME_PALETTES,
  welcomeGraphemes,
  welcomeTextTokens,
  welcomeTextRuns,
  type WelcomeCardStyle,
  type WelcomeTextToken,
} from "./welcomeCard"

// Both the browser canvas and Skia implement this small drawing contract.
export type WelcomeDrawingContext = Pick<
  CanvasRenderingContext2D,
  | "font"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "textAlign"
  | "textBaseline"
  | "shadowColor"
  | "shadowBlur"
  | "createLinearGradient"
  | "createRadialGradient"
  | "fillRect"
  | "beginPath"
  | "arc"
  | "fill"
  | "stroke"
  | "save"
  | "restore"
  | "clip"
  | "roundRect"
  | "fillText"
  | "measureText"
>
export type WelcomeCardCopy = {
  member: string
  server: string
  subtext: string
}
export type WelcomeAssetDrawer = (
  key: string,
  x: number,
  y: number,
  size: number
) => boolean

export function welcomeCardText(
  copy: WelcomeCardCopy,
  style: WelcomeCardStyle = FREE_WELCOME_STYLE
) {
  // Substitution cannot turn an untrusted display name into a custom emoji request.
  const template = cleanWelcomeText(style.greeting).split(
    /(\{member\}|\{server\})/g
  )
  const title = template.flatMap((part) =>
    part === "{member}"
      ? welcomeTextTokens(cleanWelcomeText(copy.member))
      : part === "{server}"
        ? welcomeTextTokens(cleanWelcomeText(copy.server))
        : welcomeTextTokens(part, true)
  )
  return {
    title,
    subtext: welcomeTextTokens(cleanWelcomeText(copy.subtext), true),
  }
}

export function drawWelcomeCard(
  context: WelcomeDrawingContext,
  copy: WelcomeCardCopy,
  drawAsset: WelcomeAssetDrawer,
  style: WelcomeCardStyle = FREE_WELCOME_STYLE
): void {
  const { width, height } = WELCOME_CARD_SIZE
  const palette = WELCOME_PALETTES[style.palette]
  context.textAlign = "left"
  context.textBaseline = "alphabetic"
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, palette.background)
  gradient.addColorStop(
    0.48,
    style.preset === "classic" ? "#102126" : palette.secondary
  )
  gradient.addColorStop(1, palette.secondary)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  function glow(x: number, y: number, radius: number, color: string) {
    const glow = context.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, color)
    glow.addColorStop(1, "#00000000")
    context.fillStyle = glow
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  if (style.preset === "classic" || style.preset === "aurora") {
    glow(760, 34, 210, palette.accent + "48")
    glow(850, 308, 220, "#d946ef2e")
    glow(118, 36, 190, "#10b9811f")
  }
  if (style.preset === "spotlight") {
    glow(155, 180, 290, palette.accent + "70")
    context.fillStyle = palette.accent + "18"
    context.fillRect(290, 40, 630, 280)
  }
  if (style.preset === "ribbon") {
    context.fillStyle = palette.accent
    context.fillRect(0, 0, width, 12)
    context.fillStyle = palette.accent + "28"
    context.fillRect(0, 280, width, 80)
  }
  if (style.preset === "aurora") {
    context.fillStyle = palette.accent + "20"
    context.fillRect(292, 50, 5, 260)
  }
  context.strokeStyle = "#94a3b833"
  context.lineWidth = 2
  context.beginPath()
  context.roundRect(18, 18, width - 36, height - 36, 28)
  context.stroke()
  context.save()
  context.shadowColor = palette.accent + "73"
  context.shadowBlur = 26
  context.fillStyle = palette.accent
  context.beginPath()
  context.arc(157, 179, 90, 0, Math.PI * 2)
  context.fill()
  context.restore()
  context.save()
  context.beginPath()
  context.arc(157, 179, 85, 0, Math.PI * 2)
  context.clip()
  if (!drawAsset("avatar", 72, 94, 170)) {
    const fallback = context.createLinearGradient(72, 94, 242, 264)
    fallback.addColorStop(0, "#0891b2")
    fallback.addColorStop(1, "#7c3aed")
    context.fillStyle = fallback
    context.fillRect(72, 94, 170, 170)
    context.fillStyle = "#ecfeff"
    const initial = welcomeGraphemes(cleanWelcomeText(copy.member))[0] ?? "C"
    drawText(
      welcomeTextTokens(initial.toUpperCase()),
      157,
      201,
      150,
      58,
      700,
      true
    )
  }
  context.restore()
  context.fillStyle = "#ecfeffb8"
  drawText(welcomeTextTokens("WELCOME"), 292, 118, 560, 30, 700)
  const text = welcomeCardText(copy, style)
  context.fillStyle = "#f8fafc"
  drawText(text.title, 292, 196, 560, 64, 800)
  context.fillStyle = "#e2e8f0db"
  drawText(text.subtext, 292, 258, 560, 32, 600)

  function drawText(
    tokens: WelcomeTextToken[],
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number,
    weight: number,
    initial = false
  ) {
    const fitted = fitWelcomeText(context, tokens, maxWidth, fontSize, weight)
    let cursor = initial
      ? x - fitted.width / 2
      : style.align === "center"
        ? x + (maxWidth - fitted.width) / 2
        : x
    for (const token of welcomeTextRuns(fitted.tokens)) {
      if (
        token.kind !== "text" &&
        drawAsset(
          token.kind === "custom" ? `custom:${token.id}` : `emoji:${token.key}`,
          cursor,
          y - fitted.size * 0.82,
          fitted.size
        )
      )
        cursor += fitted.size
      else {
        const value = token.kind === "custom" ? `:${token.name}:` : token.value
        context.fillText(
          value,
          cursor,
          y,
          token.kind === "text" ? undefined : fitted.size
        )
        cursor +=
          token.kind === "text" ? context.measureText(value).width : fitted.size
      }
    }
  }
}

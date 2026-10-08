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
  | "moveTo"
  | "lineTo"
  | "bezierCurveTo"
  | "closePath"
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

export const WELCOME_EMOJI_BASELINE = 0.82
export function welcomeAvatarInitial(member: string): string {
  return (
    welcomeGraphemes(cleanWelcomeText(member)).find((value) =>
      /^[\p{L}\p{N}]/u.test(value)
    ) ?? "C"
  ).toUpperCase()
}

export function welcomeCardLayout(preset: WelcomeCardStyle["preset"]) {
  if (preset === "spotlight")
    return {
      avatar: { x: 480, y: 95, radius: 54 },
      text: {
        x: 64,
        width: 832,
        headingY: 191,
        titleY: 244,
        subtextY: 299,
        titleSize: 48,
        subtextSize: 26,
      },
    }
  if (preset === "aurora")
    return {
      avatar: { x: 138, y: 180, radius: 68 },
      text: {
        x: 260,
        width: 630,
        headingY: 112,
        titleY: 193,
        subtextY: 250,
        titleSize: 58,
        subtextSize: 29,
      },
    }
  if (preset === "ribbon")
    return {
      avatar: { x: 141, y: 180, radius: 67 },
      text: {
        x: 282,
        width: 610,
        headingY: 112,
        titleY: 193,
        subtextY: 251,
        titleSize: 56,
        subtextSize: 29,
      },
    }
  return {
    avatar: { x: 157, y: 179, radius: 85 },
    text: {
      x: 292,
      width: 560,
      headingY: 118,
      titleY: 196,
      subtextY: 258,
      titleSize: 64,
      subtextSize: 32,
    },
  }
}

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
    heading: welcomeTextTokens(
      style.preset === "classic"
        ? "WELCOME"
        : `WELCOME TO ${cleanWelcomeText(copy.server).toUpperCase()}`
    ),
    title,
    subtext: welcomeTextTokens(cleanWelcomeText(copy.subtext), true),
  }
}

export function drawWelcomeCard(
  context: WelcomeDrawingContext,
  copy: WelcomeCardCopy,
  drawAsset: WelcomeAssetDrawer,
  style: WelcomeCardStyle = FREE_WELCOME_STYLE,
  hasAsset: (key: string) => boolean = () => false
) {
  const { width, height } = WELCOME_CARD_SIZE
  const palette = WELCOME_PALETTES[style.palette]
  const { avatar, text: layout } = welcomeCardLayout(style.preset)
  context.textAlign = "left"
  context.textBaseline = "alphabetic"
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, palette.background)
  gradient.addColorStop(
    0.48,
    style.preset === "classic" ? "#102126" : "#0c111b"
  )
  gradient.addColorStop(1, palette.secondary)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  function glow(x: number, y: number, radius: number, color: string) {
    const light = context.createRadialGradient(x, y, 0, x, y, radius)
    light.addColorStop(0, color)
    light.addColorStop(1, "#00000000")
    context.fillStyle = light
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  if (style.preset === "classic") {
    glow(760, 34, 210, palette.accent + "48")
    glow(850, 308, 220, "#d946ef2e")
    glow(118, 36, 190, "#10b9811f")
    context.strokeStyle = "#94a3b833"
    context.lineWidth = 2
    context.beginPath()
    context.roundRect(18, 18, width - 36, height - 36, 28)
    context.stroke()
  }
  if (style.preset === "aurora") {
    glow(355, -40, 460, palette.accent + "35")
    glow(830, 390, 400, "#a78bfa35")
    for (const offset of [0, 24, 48]) {
      context.beginPath()
      context.moveTo(0, 320 + offset)
      context.bezierCurveTo(
        370,
        90 + offset,
        560,
        440 + offset,
        960,
        65 + offset
      )
      context.strokeStyle = palette.accent + "18"
      context.lineWidth = 1
      context.stroke()
    }
  }
  if (style.preset === "spotlight") {
    glow(480, 95, 230, palette.accent + "3a")
    for (const radius of [76, 106, 138]) {
      context.beginPath()
      context.arc(480, 95, radius, 0, Math.PI * 2)
      context.strokeStyle = palette.accent + "16"
      context.lineWidth = 1
      context.stroke()
    }
  }
  if (style.preset === "ribbon") {
    const band = context.createLinearGradient(0, 0, 270, height)
    band.addColorStop(0, palette.accent + "65")
    band.addColorStop(1, palette.accent + "15")
    context.fillStyle = band
    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(230, 0)
    context.lineTo(270, 360)
    context.lineTo(0, 360)
    context.closePath()
    context.fill()
    context.fillStyle = palette.accent
    context.fillRect(282, 71, 38, 4)
    context.strokeStyle = "#ffffff15"
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(230, 0)
    context.lineTo(270, 360)
    context.stroke()
  }

  context.save()
  context.shadowColor = palette.accent + "50"
  context.shadowBlur = style.preset === "classic" ? 26 : 18
  context.fillStyle = palette.accent
  context.beginPath()
  context.arc(avatar.x, avatar.y, avatar.radius + 3, 0, Math.PI * 2)
  context.fill()
  context.restore()
  context.save()
  context.beginPath()
  context.arc(avatar.x, avatar.y, avatar.radius, 0, Math.PI * 2)
  context.clip()
  if (
    !drawAsset(
      "avatar",
      avatar.x - avatar.radius,
      avatar.y - avatar.radius,
      avatar.radius * 2
    )
  ) {
    const fallback = context.createLinearGradient(
      avatar.x - avatar.radius,
      avatar.y - avatar.radius,
      avatar.x + avatar.radius,
      avatar.y + avatar.radius
    )
    fallback.addColorStop(0, palette.secondary)
    fallback.addColorStop(1, palette.background)
    context.fillStyle = fallback
    context.fillRect(
      avatar.x - avatar.radius,
      avatar.y - avatar.radius,
      avatar.radius * 2,
      avatar.radius * 2
    )
    context.fillStyle = "#ecfeff"
    drawText(
      welcomeTextTokens(welcomeAvatarInitial(copy.member)),
      avatar.x,
      avatar.y + avatar.radius * 0.28,
      avatar.radius * 1.7,
      avatar.radius * 0.78,
      600,
      true
    )
  }
  context.restore()

  const text = welcomeCardText(copy, style)
  context.fillStyle = palette.accent
  drawText(
    text.heading,
    layout.x,
    layout.headingY,
    layout.width,
    style.preset === "classic" ? 30 : 20,
    700
  )
  context.fillStyle = "#f8fafc"
  const title = drawText(
    text.title,
    layout.x,
    layout.titleY,
    layout.width,
    layout.titleSize,
    800
  )
  context.fillStyle = "#cbd5e1"
  const subtext = drawText(
    text.subtext,
    layout.x,
    layout.subtextY,
    layout.width,
    layout.subtextSize,
    400
  )

  function drawText(
    tokens: WelcomeTextToken[],
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number,
    weight: number,
    initial = false
  ) {
    // Resolve missing custom images before fitting, so their readable labels
    // occupy their true text width rather than a compressed emoji square.
    const resolved = tokens.map((token): WelcomeTextToken =>
      token.kind === "custom" && !hasAsset(`custom:${token.id}`)
        ? { kind: "text", value: `:${token.name}:` }
        : token
    )
    const fitted = fitWelcomeText(context, resolved, maxWidth, fontSize, weight)
    let cursor = initial
      ? x - fitted.width / 2
      : style.align === "center"
        ? x + (maxWidth - fitted.width) / 2
        : x
    const origin = cursor
    for (const token of welcomeTextRuns(fitted.tokens)) {
      if (
        token.kind !== "text" &&
        drawAsset(
          token.kind === "custom" ? `custom:${token.id}` : `emoji:${token.key}`,
          cursor,
          y - fitted.size * WELCOME_EMOJI_BASELINE,
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
          token.kind === "emoji" ? fitted.size : undefined
        )
        cursor +=
          token.kind === "emoji"
            ? fitted.size
            : context.measureText(value).width
      }
    }
    return { ...fitted, x: origin, y, maxWidth, weight }
  }
  return { title, subtext }
}

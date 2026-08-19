import { createCanvas } from "@napi-rs/canvas"

const CANVAS_SIZE = 1024
const BALL_RADIUS = 420
const BALL_CENTER = CANVAS_SIZE / 2

const TRIANGLE_TOP_Y = 330
const TRIANGLE_BOTTOM_Y = 700
const TRIANGLE_HALF_WIDTH = 200

const ANSWER_MAX_WIDTH = 270
const ANSWER_MAX_HEIGHT = 190

type FittedText = {
  fontSize: number
  lineHeight: number
  lines: string[]
}

export function renderEightBallImage(answer: string): Buffer {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE)
  const ctx = canvas.getContext("2d")

  drawBackground(ctx)
  drawBall(ctx)
  drawWindow(ctx)

  const fitted = fitAnswerText(ctx, normalizeAnswer(answer))
  drawAnswerText(ctx, fitted)

  return canvas.toBuffer("image/png")
}

function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, " ").toUpperCase()
}

function drawBackground(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>
): void {
  const gradient = ctx.createRadialGradient(
    BALL_CENTER,
    BALL_CENTER - 120,
    120,
    BALL_CENTER,
    BALL_CENTER,
    650
  )

  gradient.addColorStop(0, "#1c1f2a")
  gradient.addColorStop(0.55, "#0f1118")
  gradient.addColorStop(1, "#05070b")

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
}

function drawBall(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>
): void {
  ctx.save()

  const ballGradient = ctx.createRadialGradient(
    BALL_CENTER - 130,
    BALL_CENTER - 170,
    40,
    BALL_CENTER,
    BALL_CENTER,
    BALL_RADIUS + 50
  )

  ballGradient.addColorStop(0, "#50545f")
  ballGradient.addColorStop(0.12, "#1d212a")
  ballGradient.addColorStop(0.45, "#090b10")
  ballGradient.addColorStop(1, "#000000")

  ctx.beginPath()
  ctx.arc(BALL_CENTER, BALL_CENTER, BALL_RADIUS, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = ballGradient
  ctx.fill()

  ctx.lineWidth = 8
  ctx.strokeStyle = "rgba(255,255,255,0.08)"
  ctx.stroke()

  const rimHighlight = ctx.createRadialGradient(
    BALL_CENTER - 170,
    BALL_CENTER - 210,
    10,
    BALL_CENTER - 170,
    BALL_CENTER - 210,
    180
  )

  rimHighlight.addColorStop(0, "rgba(255,255,255,0.36)")
  rimHighlight.addColorStop(0.5, "rgba(255,255,255,0.08)")
  rimHighlight.addColorStop(1, "rgba(255,255,255,0)")

  ctx.beginPath()
  ctx.arc(BALL_CENTER, BALL_CENTER, BALL_RADIUS, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = rimHighlight
  ctx.fill()

  const shine = ctx.createLinearGradient(
    BALL_CENTER - 240,
    BALL_CENTER - 280,
    BALL_CENTER - 90,
    BALL_CENTER - 80
  )

  shine.addColorStop(0, "rgba(255,255,255,0.28)")
  shine.addColorStop(0.4, "rgba(255,255,255,0.10)")
  shine.addColorStop(1, "rgba(255,255,255,0)")

  ctx.beginPath()
  ctx.ellipse(
    BALL_CENTER - 140,
    BALL_CENTER - 165,
    100,
    150,
    -0.55,
    0,
    Math.PI * 2
  )
  ctx.closePath()
  ctx.fillStyle = shine
  ctx.fill()

  ctx.restore()
}

function drawWindow(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>
): void {
  ctx.save()

  const triangleGradient = ctx.createLinearGradient(
    BALL_CENTER,
    TRIANGLE_TOP_Y,
    BALL_CENTER,
    TRIANGLE_BOTTOM_Y
  )

  triangleGradient.addColorStop(0, "#5fd6ff")
  triangleGradient.addColorStop(0.28, "#1ea8ff")
  triangleGradient.addColorStop(0.75, "#0b3dbb")
  triangleGradient.addColorStop(1, "#061f6d")

  ctx.beginPath()
  ctx.moveTo(BALL_CENTER, TRIANGLE_TOP_Y)
  ctx.lineTo(BALL_CENTER - TRIANGLE_HALF_WIDTH, TRIANGLE_BOTTOM_Y)
  ctx.lineTo(BALL_CENTER + TRIANGLE_HALF_WIDTH, TRIANGLE_BOTTOM_Y)
  ctx.closePath()

  ctx.fillStyle = triangleGradient
  ctx.fill()

  ctx.lineWidth = 6
  ctx.strokeStyle = "rgba(255,255,255,0.28)"
  ctx.stroke()

  const innerGlow = ctx.createRadialGradient(
    BALL_CENTER,
    TRIANGLE_TOP_Y + 120,
    20,
    BALL_CENTER,
    TRIANGLE_BOTTOM_Y - 40,
    280
  )

  innerGlow.addColorStop(0, "rgba(255,255,255,0.20)")
  innerGlow.addColorStop(0.45, "rgba(255,255,255,0.08)")
  innerGlow.addColorStop(1, "rgba(255,255,255,0)")

  ctx.beginPath()
  ctx.moveTo(BALL_CENTER, TRIANGLE_TOP_Y)
  ctx.lineTo(BALL_CENTER - TRIANGLE_HALF_WIDTH, TRIANGLE_BOTTOM_Y)
  ctx.lineTo(BALL_CENTER + TRIANGLE_HALF_WIDTH, TRIANGLE_BOTTOM_Y)
  ctx.closePath()
  ctx.fillStyle = innerGlow
  ctx.fill()

  ctx.restore()
}

function fitAnswerText(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  answer: string
): FittedText {
  for (let fontSize = 54; fontSize >= 26; fontSize -= 2) {
    const lineHeight = Math.round(fontSize * 1.15)
    ctx.font = `700 ${fontSize}px sans-serif`

    const lines = wrapText(ctx, answer, ANSWER_MAX_WIDTH)

    if (lines.length === 0) {
      continue
    }

    const widestLine = Math.max(
      ...lines.map((line) => ctx.measureText(line).width)
    )
    const textHeight = lines.length * lineHeight

    if (widestLine <= ANSWER_MAX_WIDTH && textHeight <= ANSWER_MAX_HEIGHT) {
      return {
        fontSize,
        lineHeight,
        lines,
      }
    }
  }

  return {
    fontSize: 26,
    lineHeight: 30,
    lines: wrapText(ctx, answer, ANSWER_MAX_WIDTH).slice(0, 5),
  }
}

function wrapText(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ").filter(Boolean)

  if (words.length === 0) {
    return ["..."]
  }

  const lines: string[] = []
  let currentLine = words[0] ?? ""

  for (const word of words.slice(1)) {
    const nextLine = `${currentLine} ${word}`

    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine
      continue
    }

    lines.push(currentLine)
    currentLine = word
  }

  lines.push(currentLine)

  return lines
}

function drawAnswerText(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  fitted: FittedText
): void {
  const { fontSize, lineHeight, lines } = fitted

  ctx.save()

  ctx.font = `700 ${fontSize}px sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const totalHeight = lines.length * lineHeight
  const startY = 520 - totalHeight / 2 + lineHeight / 2

  for (const [index, line] of lines.entries()) {
    const y = startY + index * lineHeight

    ctx.strokeStyle = "rgba(5, 20, 70, 0.85)"
    ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.14))
    ctx.lineJoin = "round"
    ctx.miterLimit = 2
    ctx.strokeText(line, BALL_CENTER, y)

    ctx.fillStyle = "#ffffff"
    ctx.fillText(line, BALL_CENTER, y)
  }

  ctx.restore()
}

export const WELCOME_CARD_SIZE = { width: 960, height: 360 } as const
export const DEFAULT_WELCOME_SUBTEXT =
  "Settle in, say hello, and enjoy the server."
export const WELCOME_FONT_FAMILY =
  '"Cleo Geist latin", "Cleo Geist latin-ext", "Cleo Geist cyrillic", "Cleo Geist cyrillic-ext", sans-serif'
export const WELCOME_FONT_SUBSETS = [
  "latin",
  "latin-ext",
  "cyrillic",
  "cyrillic-ext",
] as const
export const WELCOME_PRESETS = [
  { id: "classic", name: "Cleo Classic", premium: false },
  { id: "aurora", name: "Aurora", premium: true },
  { id: "spotlight", name: "Spotlight", premium: true },
  { id: "ribbon", name: "Ribbon", premium: true },
] as const
export const WELCOME_PALETTES = {
  cyan: { background: "#071013", secondary: "#111827", accent: "#22d3ee" },
  orchid: { background: "#170e24", secondary: "#312050", accent: "#e879f9" },
  forest: { background: "#071a14", secondary: "#15392b", accent: "#34d399" },
  amber: { background: "#1c1408", secondary: "#3b2811", accent: "#fbbf24" },
} as const
export type WelcomeCardStyle = {
  preset: (typeof WELCOME_PRESETS)[number]["id"]
  palette: keyof typeof WELCOME_PALETTES
  greeting: string
  align: "left" | "center"
}
export const FREE_WELCOME_STYLE: WelcomeCardStyle = {
  preset: "classic",
  palette: "cyan",
  greeting: "Welcome, {member}",
  align: "left",
}

export function parseWelcomeCardStyle(value: unknown): WelcomeCardStyle {
  if (!value || typeof value !== "object")
    throw new Error("Invalid welcome-card style")
  if (
    !("preset" in value) ||
    !("palette" in value) ||
    !("greeting" in value) ||
    !("align" in value)
  )
    throw new Error("Incomplete welcome-card style")
  const { preset, palette, greeting, align } = value
  if (
    preset !== "classic" &&
    preset !== "aurora" &&
    preset !== "spotlight" &&
    preset !== "ribbon"
  )
    throw new Error("Unknown welcome-card preset")
  if (
    palette !== "cyan" &&
    palette !== "orchid" &&
    palette !== "forest" &&
    palette !== "amber"
  )
    throw new Error("Unknown welcome-card palette")
  if (align !== "left" && align !== "center")
    throw new Error("Unknown welcome-card alignment")
  if (
    typeof greeting !== "string" ||
    greeting.trim().length === 0 ||
    greeting.length > 120 ||
    /[{}]/.test(greeting.replace(/\{(?:member|server)\}/g, ""))
  )
    throw new Error(
      "Use up to 120 characters and only {member} or {server} placeholders"
    )
  return { preset, palette, greeting, align }
}

export function isFreeWelcomeStyle(style: WelcomeCardStyle): boolean {
  return (
    style.preset === "classic" &&
    style.palette === "cyan" &&
    style.greeting === FREE_WELCOME_STYLE.greeting &&
    style.align === "left"
  )
}

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" })
export function welcomeGraphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), (entry) => entry.segment)
}
export function cleanWelcomeText(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}
export function formatWelcomeGreeting(
  template: string,
  member: string,
  server: string
): string {
  return template.replace(/\{(member|server)\}/g, (_, token: string) =>
    token === "member" ? member : server
  )
}

export type WelcomeTextToken =
  | { kind: "text"; value: string }
  | { kind: "emoji"; value: string; key: string }
  | { kind: "custom"; value: string; id: string; name: string }

export function welcomeTextRuns(
  tokens: WelcomeTextToken[]
): WelcomeTextToken[] {
  const runs: WelcomeTextToken[] = []
  for (const token of tokens) {
    const last = runs.at(-1)
    if (token.kind === "text" && last?.kind === "text")
      last.value += token.value
    else runs.push({ ...token })
  }
  return runs
}

export function welcomeTextTokens(
  value: string,
  customEmoji = false
): WelcomeTextToken[] {
  const tokens: WelcomeTextToken[] = []
  // Custom markup is accepted only in intentional welcome-copy fields.
  const parts = customEmoji
    ? value.split(/(<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>)/g)
    : [value]
  for (const part of parts) {
    const custom = customEmoji
      ? /^<a?:([A-Za-z0-9_]{2,32}):(\d{17,20})>$/.exec(part)
      : null
    if (custom?.[1] && custom[2]) {
      tokens.push({
        kind: "custom",
        value: part,
        id: custom[2],
        name: custom[1],
      })
      continue
    }
    for (const grapheme of welcomeGraphemes(part)) {
      if (
        /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(
          grapheme
        ) &&
        !grapheme.includes("\ufe0e")
      ) {
        const code = grapheme.replace(/\ufe0f/g, "")
        const key = Array.from(code, (point) =>
          point.codePointAt(0)!.toString(16)
        ).join("-")
        tokens.push({ kind: "emoji", value: grapheme, key })
      } else tokens.push({ kind: "text", value: grapheme })
    }
  }
  return tokens
}

type TextMetricsContext = {
  font: string
  measureText(text: string): { width: number }
}
export function fitWelcomeText(
  context: TextMetricsContext,
  tokens: WelcomeTextToken[],
  maxWidth: number,
  fontSize: number,
  weight = 600
): { tokens: WelcomeTextToken[]; size: number; width: number } {
  const width = (items: WelcomeTextToken[], size: number) =>
    welcomeTextRuns(items).reduce(
      (total, token) =>
        total +
        (token.kind === "text" ? context.measureText(token.value).width : size),
      0
    )
  let size = fontSize
  context.font = `${weight} ${size}px ${WELCOME_FONT_FAMILY}`
  while (width(tokens, size) > maxWidth && size > 18) {
    size = Math.max(18, size - 2)
    context.font = `${weight} ${size}px ${WELCOME_FONT_FAMILY}`
  }
  const fitted = [...tokens]
  if (width(fitted, size) > maxWidth) {
    const ellipsis: WelcomeTextToken = { kind: "text", value: "…" }
    while (fitted.length && width([...fitted, ellipsis], size) > maxWidth)
      fitted.pop()
    if (context.measureText(ellipsis.value).width <= maxWidth)
      fitted.push(ellipsis)
  }
  return { tokens: fitted, size, width: width(fitted, size) }
}

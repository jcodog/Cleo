import assert from "node:assert/strict"
import { test } from "node:test"
import {
  drawWelcomeCard,
  welcomeCardText,
  welcomeAvatarInitial,
  type WelcomeDrawingContext,
} from "./drawWelcomeCard"
import { FREE_WELCOME_STYLE, WELCOME_PRESETS } from "./welcomeCard"

function createContext() {
  const calls: string[] = []
  const gradient = { addColorStop: () => {} }
  const context = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    clip: () => {},
    roundRect: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    closePath: () => {},
    fillText: (text: string) => {
      calls.push(text)
    },
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as WelcomeDrawingContext
  return { context, calls }
}
test("shared card drawing covers every preset, alignment and image fallback", () => {
  for (const preset of WELCOME_PRESETS)
    for (const align of ["left", "center"] as const)
      for (const loaded of [false, true]) {
        const { context, calls } = createContext()
        drawWelcomeCard(
          context,
          {
            member: "👋🏽",
            server: "Cleo",
            subtext: "Hi <:wave:123456789012345678>",
          },
          () => loaded,
          { ...FREE_WELCOME_STYLE, preset: preset.id, align },
          () => loaded
        )
        assert.ok(calls.some((text) => text.startsWith("WELCOME")))
        if (!loaded) assert.ok(calls.some((text) => text.includes(":wave:")))
      }
  const { context, calls } = createContext()
  drawWelcomeCard(
    context,
    { member: "", server: "Cleo", subtext: "" },
    () => false
  )
  assert.ok(calls.includes("C"))
})

test("fallback avatars use textual initials and missing custom labels fit at natural width", () => {
  assert.equal(welcomeAvatarInitial("🇬🇧 👋🏽 Jason"), "J")
  assert.equal(welcomeAvatarInitial("👩🏾‍💻"), "C")
  assert.equal(welcomeAvatarInitial(" 7th member"), "7")
  const { context } = createContext()
  const positions: { text: string; x: number; maxWidth?: number }[] = []
  context.fillText = (text, x, _y, maxWidth) =>
    positions.push({ text, x, maxWidth })
  const result = drawWelcomeCard(
    context,
    {
      member: "Alex",
      server: "Cleo",
      subtext: "<:wave:123456789012345678> suffix",
    },
    () => false
  )
  assert.equal(result.subtext.width, ":wave: suffix".length * 10)
  assert.ok(
    positions.some(
      (call) => call.text === ":wave: suffix" && call.maxWidth === undefined
    )
  )
  const available = drawWelcomeCard(
    context,
    {
      member: "Alex",
      server: "Cleo",
      subtext: "<:wave:123456789012345678> suffix",
    },
    () => false,
    FREE_WELCOME_STYLE,
    () => true
  )
  assert.equal(available.subtext.width, 32 + " suffix".length * 10)
  assert.ok(
    positions.some(
      (call) => call.text === ":wave:" && call.maxWidth === undefined
    )
  )
  const long = drawWelcomeCard(
    context,
    {
      member: "🇬🇧".repeat(100),
      server: "Cleo",
      subtext: "<:a_long_missing_emoji:123456789012345678>".repeat(40),
    },
    () => false
  )
  assert.ok(long.title.width <= long.title.maxWidth)
  assert.ok(long.subtext.width <= long.subtext.maxWidth)
})
test("copy substitutes only approved variables without trusting member or server markup", () => {
  const copy = {
    member: "<:evil:123456789012345678>",
    server: "@everyone",
    subtext: "Hi 👩🏾‍💻",
  }
  const text = welcomeCardText(copy, {
    ...FREE_WELCOME_STYLE,
    greeting: "Hi {member} in {server} <:wave:234567890123456789>",
  })
  assert.deepEqual(
    text.title
      .filter((token) => token.kind === "custom")
      .map((token) => token.id),
    ["234567890123456789"]
  )
  assert.equal(
    welcomeCardText(copy)
      .title.map((token) => token.value)
      .join(""),
    `Welcome, ${copy.member}`
  )
  const header = welcomeCardText(
    { ...copy, server: "Cleo 🇬🇧 <:evil:123456789012345678>" },
    { ...FREE_WELCOME_STYLE, preset: "aurora" }
  ).heading
  assert.ok(header.some((token) => token.kind === "emoji"))
  assert.equal(
    header.some((token) => token.kind === "custom"),
    false
  )
})

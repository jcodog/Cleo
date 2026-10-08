import assert from "node:assert/strict"
import { test } from "node:test"
import {
  drawWelcomeCard,
  welcomeCardText,
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
          { ...FREE_WELCOME_STYLE, preset: preset.id, align }
        )
        assert.ok(calls.includes("WELCOME"))
        if (!loaded) assert.ok(calls.includes(":wave:"))
      }
  const { context, calls } = createContext()
  drawWelcomeCard(
    context,
    { member: "", server: "Cleo", subtext: "" },
    () => false
  )
  assert.ok(calls.includes("C"))
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
})

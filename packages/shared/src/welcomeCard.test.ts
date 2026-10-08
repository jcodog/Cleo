import assert from "node:assert/strict"
import { test } from "node:test"
import {
  cleanWelcomeText,
  fitWelcomeText,
  formatWelcomeGreeting,
  FREE_WELCOME_STYLE,
  isFreeWelcomeStyle,
  parseWelcomeCardStyle,
  welcomeGraphemes,
  welcomeTextRuns,
  welcomeTextTokens,
  WELCOME_PRESETS,
} from "./welcomeCard"

test("welcome styles validate only bounded presets, palettes and formatting", () => {
  for (const preset of WELCOME_PRESETS)
    for (const palette of ["cyan", "orchid", "forest", "amber"])
      for (const align of ["left", "center"]) {
        assert.deepEqual(
          parseWelcomeCardStyle({
            preset: preset.id,
            palette,
            greeting: "Hello {member}, welcome to {server}",
            align,
          }),
          {
            preset: preset.id,
            palette,
            greeting: "Hello {member}, welcome to {server}",
            align,
          }
        )
      }
  for (const invalid of [
    null,
    true,
    {},
    { ...FREE_WELCOME_STYLE, preset: "url" },
    { ...FREE_WELCOME_STYLE, palette: "red" },
    { ...FREE_WELCOME_STYLE, align: "right" },
    { ...FREE_WELCOME_STYLE, greeting: 3 },
    { ...FREE_WELCOME_STYLE, greeting: "  " },
    { ...FREE_WELCOME_STYLE, greeting: "x".repeat(121) },
    { ...FREE_WELCOME_STYLE, greeting: "{user}" },
    { ...FREE_WELCOME_STYLE, greeting: "{member" },
    { ...FREE_WELCOME_STYLE, greeting: "member}" },
  ])
    assert.throws(() => parseWelcomeCardStyle(invalid))
  assert.ok(isFreeWelcomeStyle(FREE_WELCOME_STYLE))
  for (const change of [
    { preset: "aurora" },
    { palette: "orchid" },
    { greeting: "Hello" },
    { align: "center" },
  ])
    assert.equal(
      isFreeWelcomeStyle(
        parseWelcomeCardStyle({ ...FREE_WELCOME_STYLE, ...change })
      ),
      false
    )
})

test("welcome text preserves Unicode graphemes and sanitizes controls without destroying joiners", () => {
  const sequences = ["👋🏽", "🇬🇧", "👨‍👩‍👧‍👦", "❤️", "1️⃣", "e\u0301", "🏳️‍🌈", "©︎"]
  assert.deepEqual(welcomeGraphemes(sequences.join("")), sequences)
  assert.equal(cleanWelcomeText(" a\n\u202e👩🏾‍💻\t b "), "a 👩🏾‍💻 b")
  assert.equal(
    formatWelcomeGreeting("{member} in {server}", "{server}", "Cleo"),
    "{server} in Cleo"
  )
  const emoji = welcomeTextTokens(sequences.slice(0, 5).join(""))
  assert.deepEqual(
    emoji.map((token) => token.kind),
    ["emoji", "emoji", "emoji", "emoji", "emoji"]
  )
  assert.equal(welcomeTextTokens("©︎")[0]?.kind, "text")
  assert.deepEqual(
    welcomeTextTokens("🏳️‍🌈").map((token) =>
      token.kind === "emoji" ? token.key : null
    ),
    welcomeTextTokens("🏳‍🌈").map((token) =>
      token.kind === "emoji" ? token.key : null
    )
  )
  assert.deepEqual(welcomeTextTokens("🇬🇧")[0], {
    kind: "emoji",
    value: "🇬🇧",
    key: "1f1ec-1f1e7",
  })
})

test("custom emoji are accepted only in intentional copy fields and never accept URLs or mentions", () => {
  const value = "<:wave:123456789012345678> <a:dance:234567890123456789>"
  assert.equal(
    welcomeTextTokens(value, true).filter((token) => token.kind === "custom")
      .length,
    2
  )
  assert.equal(
    welcomeTextTokens(value).some((token) => token.kind === "custom"),
    false
  )
  for (const invalid of [
    "<:x:123>",
    "<:wave:https://evil.test>",
    "<@123456789012345678>",
    "<@&123456789012345678>",
    "@everyone",
    "<:wave:../../etc/passwd>",
  ])
    assert.equal(
      welcomeTextTokens(invalid, true).some((token) => token.kind === "custom"),
      false
    )
})

test("fitting shrinks and ellipsizes full graphemes, custom tokens and shaped text runs", () => {
  const context = {
    font: "",
    measureText: (text: string) => ({
      width:
        welcomeGraphemes(text).length *
        Number(/(\d+)px/.exec(context.font)?.[1]),
    }),
  }
  assert.equal(
    fitWelcomeText(context, welcomeTextTokens("a"), 100, 32).size,
    32
  )
  assert.equal(
    fitWelcomeText(context, welcomeTextTokens("abc"), 60, 32).size,
    20
  )
  const tokens = welcomeTextTokens("👨‍👩‍👧‍👦🇬🇧👋🏽".repeat(10))
  const fitted = fitWelcomeText(context, tokens, 60, 64)
  assert.equal(fitted.size, 18)
  assert.equal(fitted.width, 54)
  assert.deepEqual(
    fitted.tokens.map((token) => token.value),
    ["👨‍👩‍👧‍👦", "🇬🇧", "…"]
  )
  assert.deepEqual(fitWelcomeText(context, tokens, 1, 32).tokens, [])
  assert.deepEqual(fitWelcomeText(context, [], 10, 32).tokens, [])
  assert.equal(
    fitWelcomeText(
      context,
      welcomeTextTokens("<:wave:123456789012345678>", true),
      64,
      32
    ).width,
    32
  )
  assert.deepEqual(welcomeTextRuns(welcomeTextTokens("abc👋def")), [
    { kind: "text", value: "abc" },
    { kind: "emoji", value: "👋", key: "1f44b" },
    { kind: "text", value: "def" },
  ])
})

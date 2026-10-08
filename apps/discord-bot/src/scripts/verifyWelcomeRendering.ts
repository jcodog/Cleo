import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas"
import {
  FREE_WELCOME_STYLE,
  WELCOME_PRESETS,
  WELCOME_PALETTES,
  WELCOME_FONT_SUBSETS,
  WELCOME_CARD_SIZE,
  parseWelcomeCardStyle,
  welcomeTextTokens,
} from "@workspace/shared/welcomeCard"
import {
  welcomeCardText,
  drawWelcomeCard,
  WELCOME_EMOJI_BASELINE,
  welcomeCardLayout,
} from "@workspace/shared/drawWelcomeCard"
import {
  loadWelcomeEmojiAssets,
  registerWelcomeFonts,
  welcomeAssetsRoot,
} from "../services/welcomeCardAssets"
import { renderWelcomeCardPng } from "../services/welcomeCardRenderer"

export async function verifyWelcomeRendering(
  outputDirectory: string,
  recordBaseline = false
): Promise<void> {
  const startupFontFamilies = GlobalFonts.families.map((font) => font.family)
  const systemFontIsolationVerified =
    process.env.DISABLE_SYSTEM_FONTS_LOAD === "1"
  if (systemFontIsolationVerified)
    assert.deepEqual(
      startupFontFamilies,
      [],
      "Host fonts were loaded before pinned font registration"
    )
  registerWelcomeFonts()
  const fontFamilies = GlobalFonts.families.map((font) => font.family)
  const expectedFamilies = WELCOME_FONT_SUBSETS.map(
    (subset) => `Cleo Geist ${subset}`
  )
  for (const family of expectedFamilies)
    assert.ok(fontFamilies.includes(family), `Missing pinned font: ${family}`)
  await mkdir(outputDirectory, { recursive: true })
  const samples = [
    "👋🏽",
    "🇬🇧",
    "👨‍👩‍👧‍👦",
    "❤️",
    "1️⃣",
    "👩🏾‍💻",
    "🏳️‍🌈",
    "🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}",
    "🫩",
    "🫪",
    "🏳‍🌈",
    "❤‍🔥",
  ]
  for (const [index, emoji] of samples.entries()) {
    const tokens = welcomeTextTokens(emoji)
    const assets = await loadWelcomeEmojiAssets(tokens)
    const token = tokens[0]
    assert.ok(token?.kind === "emoji")
    const image = assets.get(`emoji:${token.key}`)
    assert.ok(image, `Packaged emoji missing: ${token.key}`)
    const canvas = createCanvas(
      WELCOME_CARD_SIZE.width,
      WELCOME_CARD_SIZE.height
    )
    const context = canvas.getContext("2d")
    drawWelcomeCard(
      context,
      { member: emoji, server: "Cleo", subtext: "" },
      (key, x, y, size) => {
        const asset = assets.get(key)
        if (!asset) return false
        context.drawImage(asset, x, y, size, size)
        return true
      },
      { ...FREE_WELCOME_STYLE, greeting: "{member}" }
    )
    // Compare the actual title region against the known local artwork drawn at
    // the same size over the card background. A font/tofu fallback cannot pass.
    const layout = welcomeCardLayout("classic").text
    const top = layout.titleY - layout.titleSize * WELCOME_EMOJI_BASELINE
    const region = {
      x: layout.x,
      y: Math.floor(top),
      width: layout.titleSize,
      height: Math.ceil(top + layout.titleSize) - Math.floor(top),
    }
    const actual = context.getImageData(
      region.x,
      region.y,
      region.width,
      region.height
    ).data
    const expectedCanvas = createCanvas(
      WELCOME_CARD_SIZE.width,
      WELCOME_CARD_SIZE.height
    )
    const expected = expectedCanvas.getContext("2d")
    drawWelcomeCard(
      expected,
      { member: "", server: "Cleo", subtext: "" },
      () => false,
      { ...FREE_WELCOME_STYLE, greeting: "" }
    )
    expected.drawImage(image, layout.x, top, layout.titleSize, layout.titleSize)
    assert.deepEqual(
      actual,
      expected.getImageData(region.x, region.y, region.width, region.height)
        .data,
      `Emoji pixels differ: ${emoji}`
    )
    await writeFile(
      path.join(outputDirectory, `emoji-${index}.png`),
      await canvas.encode("png")
    )
  }
  const pixelHashes: Record<string, string> = {}
  for (const preset of WELCOME_PRESETS) {
    for (const palette of Object.keys(WELCOME_PALETTES)) {
      const style = {
        ...FREE_WELCOME_STYLE,
        preset: preset.id,
        palette,
        align: preset.id === "spotlight" ? "center" : "left",
      }
      const validated = parseWelcomeCardStyle(style)
      const png = await renderWelcomeCardPng(
        {
          member: "Alex Morgan 👋🏽 🇬🇧",
          server: "Cleo HQ",
          subtext: "Hello 👩🏾‍💻 1️⃣ e\u0301 Привет ҒҗҚӢ",
        },
        validated
      )
      const image = await loadImage(png)
      assert.equal(image.width, WELCOME_CARD_SIZE.width)
      assert.equal(image.height, WELCOME_CARD_SIZE.height)
      const pixels = createCanvas(image.width, image.height)
      const context = pixels.getContext("2d")
      context.drawImage(image, 0, 0)
      pixelHashes[`${preset.id}-${palette}`] = createHash("sha256")
        .update(context.getImageData(0, 0, image.width, image.height).data)
        .digest("hex")
      await writeFile(
        path.join(outputDirectory, `${preset.id}-${palette}.png`),
        png
      )
      if (palette === "cyan")
        await writeFile(path.join(outputDirectory, `${preset.id}.png`), png)
    }
    const canvas = createCanvas(
      WELCOME_CARD_SIZE.width,
      WELCOME_CARD_SIZE.height
    )
    const context = canvas.getContext("2d")
    const copy = {
      member: "Alexandra 👩🏾‍💻 🇬🇧 ".repeat(25),
      server: "Cleo HQ",
      subtext: "Hello <:missing_long_label:123456789012345678> ".repeat(12),
    }
    const stressText = welcomeCardText(copy)
    const stressAssets = await loadWelcomeEmojiAssets(
      [...stressText.title, ...stressText.subtext].filter(
        (token) => token.kind === "emoji"
      )
    )
    const result = drawWelcomeCard(
      context,
      copy,
      (key, x, y, size) => {
        const image = stressAssets.get(key)
        if (!image) return false
        context.drawImage(image, x, y, size, size)
        return true
      },
      { ...FREE_WELCOME_STYLE, preset: preset.id }
    )
    for (const line of [result.title, result.subtext]) {
      assert.ok(
        line.width <= line.maxWidth,
        `${preset.id}: fitted text exceeds its region`
      )
      assert.equal(
        line.tokens.at(-1)?.value,
        "…",
        `${preset.id}: overflowing text must ellipsize`
      )
    }
    pixelHashes[`${preset.id}-fitting`] = createHash("sha256")
      .update(context.getImageData(0, 0, canvas.width, canvas.height).data)
      .digest("hex")
    await writeFile(
      path.join(outputDirectory, `${preset.id}-fitting.png`),
      await canvas.encode("png")
    )
  }
  if (recordBaseline)
    await writeFile(
      path.join(outputDirectory, "render-golden.json"),
      JSON.stringify(pixelHashes, null, 2) + "\n"
    )
  else if (process.platform === "linux") {
    const expected: unknown = JSON.parse(
      await readFile(new URL("render-golden.json", welcomeAssetsRoot), "utf8")
    )
    assert.deepEqual(
      pixelHashes,
      expected,
      "Welcome pixels changed. Inspect PNGs before updating the reviewed Linux baseline."
    )
  }
  await writeFile(
    path.join(outputDirectory, "verification.json"),
    JSON.stringify(
      {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        emojiPixelComparisons: samples.length,
        presets: WELCOME_PRESETS.map((preset) => preset.id),
        systemFontIsolationVerified,
        startupFontFamilies,
        registeredFontFamilies: fontFamilies,
        presetPixelHashes: pixelHashes,
        linuxGoldenPixelsVerified:
          process.platform === "linux" && !recordBaseline,
      },
      null,
      2
    ) + "\n"
  )
}

export async function verifyWelcomeAssetManifest(
  assetsDirectory: string
): Promise<void> {
  const manifest: unknown = JSON.parse(
    await readFile(path.join(assetsDirectory, "manifest.json"), "utf8")
  )
  assert.ok(manifest && typeof manifest === "object")
  for (const [name, hash] of Object.entries(manifest)) {
    assert.match(
      name,
      /^(?:emoji\/[a-f0-9-]+\.svg|fonts\/geist-[a-z-]+-\d+-normal\.woff|FONT-LICENSE|EMOJI-LICENSE|EMOJI-NOTICE\.txt|render-golden\.json)$/
    )
    const actual = createHash("sha256")
      .update(await readFile(path.join(assetsDirectory, name)))
      .digest("hex")
    assert.equal(actual, hash, `Welcome asset changed: ${name}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyWelcomeRendering(
    process.argv[2] ?? path.resolve("welcome-render-verification"),
    process.argv[4] === "--record-baseline"
  )
  const assets = process.argv[3]
  if (assets) await verifyWelcomeAssetManifest(assets)
}

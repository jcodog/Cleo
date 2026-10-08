import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import {
  FREE_WELCOME_STYLE,
  WELCOME_PRESETS,
  welcomeTextTokens,
} from "@workspace/shared/welcomeCard"
import { drawWelcomeCard } from "@workspace/shared/drawWelcomeCard"
import {
  loadWelcomeEmojiAssets,
  registerWelcomeFonts,
} from "../services/welcomeCardAssets"
import { renderWelcomeCardPng } from "../services/welcomeCardRenderer"

export async function verifyWelcomeRendering(
  outputDirectory: string
): Promise<void> {
  registerWelcomeFonts()
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
    const canvas = createCanvas(960, 360)
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
    const actual = context.getImageData(292, 143, 64, 64).data
    const expectedCanvas = createCanvas(960, 360)
    const expected = expectedCanvas.getContext("2d")
    drawWelcomeCard(
      expected,
      { member: "", server: "Cleo", subtext: "" },
      () => false,
      { ...FREE_WELCOME_STYLE, greeting: "" }
    )
    expected.drawImage(image, 292, 196 - 64 * 0.82, 64, 64)
    assert.deepEqual(
      actual,
      expected.getImageData(292, 143, 64, 64).data,
      `Emoji pixels differ: ${emoji}`
    )
    await writeFile(
      path.join(outputDirectory, `emoji-${index}.png`),
      await canvas.encode("png")
    )
  }
  for (const preset of WELCOME_PRESETS) {
    const png = await renderWelcomeCardPng(
      {
        member: "Jason 👋🏽 🇬🇧",
        server: "Cleo HQ",
        subtext: "Hello 👩🏾‍💻 1️⃣ e\u0301 Привет",
      },
      { ...FREE_WELCOME_STYLE, preset: preset.id }
    )
    const image = await loadImage(png)
    assert.equal(image.width, 960)
    assert.equal(image.height, 360)
    await writeFile(path.join(outputDirectory, `${preset.id}.png`), png)
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
        systemFontsDisabled: process.env.DISABLE_SYSTEM_FONTS_LOAD === "1",
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
      /^(?:emoji\/[a-f0-9-]+\.svg|fonts\/geist-[a-z-]+-\d+-normal\.woff|FONT-LICENSE|EMOJI-LICENSE|EMOJI-NOTICE\.txt)$/
    )
    const actual = createHash("sha256")
      .update(await readFile(path.join(assetsDirectory, name)))
      .digest("hex")
    assert.equal(actual, hash, `Welcome asset changed: ${name}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyWelcomeRendering(
    process.argv[2] ?? path.resolve("welcome-render-verification")
  )
  const assets = process.argv[3]
  if (assets) await verifyWelcomeAssetManifest(assets)
}

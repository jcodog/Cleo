import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { GlobalFonts, loadImage, type Image } from "@napi-rs/canvas"
import type { WelcomeTextToken } from "@workspace/shared/welcomeCard"

const assetsRoot = new URL("./welcome-assets/", import.meta.url)
let fontsLoaded = false
export function registerWelcomeFonts(): void {
  if (fontsLoaded) return
  for (const subset of ["latin", "latin-ext", "cyrillic"]) {
    for (const weight of [400, 600, 700, 800]) {
      if (
        !GlobalFonts.registerFromPath(
          fileURLToPath(
            new URL(`fonts/geist-${subset}-${weight}-normal.woff`, assetsRoot)
          ),
          `Cleo Geist ${subset}`
        )
      )
        throw new Error("Packaged welcome-card font is missing or invalid")
    }
  }
  fontsLoaded = true
}

const maxImageBytes = 256 * 1024
export class WelcomeEmojiLoader {
  private readonly cache = new Map<
    string,
    { image: Image | null; expires: number }
  >()
  private readonly pending = new Map<string, Promise<Image | null>>()
  constructor(
    private readonly fetchImage: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async loadCustom(id: string): Promise<Image | null> {
    if (!/^\d{17,20}$/.test(id)) return null
    const cached = this.cache.get(id)
    if (cached && cached.expires > this.now()) return cached.image
    const pending = this.pending.get(id)
    if (pending) return pending
    if (this.pending.size >= 8) return null
    const request = this.fetchCustom(id)
      .then((image) => {
        this.cache.delete(id)
        if (this.cache.size >= 128)
          this.cache.delete(this.cache.keys().next().value ?? "")
        this.cache.set(id, {
          image,
          expires: this.now() + (image ? 600_000 : 60_000),
        })
        return image
      })
      .finally(() => this.pending.delete(id))
    this.pending.set(id, request)
    return request
  }

  private async fetchCustom(id: string): Promise<Image | null> {
    try {
      // PNG uses the static frame for animated emoji. No redirects or user URLs.
      const response = await this.fetchImage(
        `https://cdn.discordapp.com/emojis/${id}.png?size=64&quality=lossless`,
        { redirect: "error", signal: AbortSignal.timeout(2000) }
      )
      if (
        !response.ok ||
        response.headers.get("content-type")?.split(";")[0] !== "image/png" ||
        Number(response.headers.get("content-length")) > maxImageBytes ||
        !response.body
      ) {
        await response.body?.cancel()
        return null
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.length
        if (bytes > maxImageBytes) {
          await reader.cancel()
          return null
        }
        chunks.push(chunk.value)
      }
      const buffer = Buffer.concat(chunks)
      if (
        buffer.length < 24 ||
        !buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        buffer.readUInt32BE(16) > 256 ||
        buffer.readUInt32BE(20) > 256
      )
        return null
      return await loadImage(buffer)
    } catch {
      return null
    }
  }
}

const customLoader = new WelcomeEmojiLoader()
const unicodeCache = new Map<string, Promise<Image | null>>()
export async function loadWelcomeEmojiAssets(
  tokens: WelcomeTextToken[],
  loader = customLoader
): Promise<Map<string, Image>> {
  const requests = new Map<string, Promise<Image | null>>()
  for (const token of tokens) {
    if (token.kind === "custom") {
      if (
        Array.from(requests.keys()).filter((key) => key.startsWith("custom:"))
          .length < 8
      )
        requests.set(`custom:${token.id}`, loader.loadCustom(token.id))
    } else if (token.kind === "emoji") {
      if (!unicodeCache.has(token.key)) {
        if (unicodeCache.size >= 256)
          unicodeCache.delete(unicodeCache.keys().next().value ?? "")
        unicodeCache.set(token.key, loadUnicodeEmoji(token.key))
      }
      requests.set(
        `emoji:${token.key}`,
        unicodeCache.get(token.key) ?? Promise.resolve(null)
      )
    }
  }
  const images = new Map<string, Image>()
  await Promise.all(
    Array.from(requests, async ([key, request]) => {
      const image = await request
      if (image) images.set(key, image)
    })
  )
  return images
}

async function loadUnicodeEmoji(key: string): Promise<Image | null> {
  if (!/^[a-f0-9]+(?:-[a-f0-9]+)*$/.test(key) || key.length > 160) return null
  try {
    return await loadImage(
      await readFile(new URL(`emoji/${key}.svg`, assetsRoot))
    )
  } catch {
    return null
  }
}

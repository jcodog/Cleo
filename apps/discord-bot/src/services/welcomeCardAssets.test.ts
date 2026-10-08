import assert from "node:assert/strict"
import { test } from "node:test"
import { createCanvas } from "@napi-rs/canvas"
import { welcomeTextTokens } from "@workspace/shared/welcomeCard"
import { WelcomeEmojiLoader, loadWelcomeEmojiAssets } from "./welcomeCardAssets"

async function png(): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = createCanvas(64, 64)
  canvas.getContext("2d").fillRect(0, 0, 64, 64)
  return new Uint8Array(await canvas.encode("png"))
}
test("static and animated custom emoji use bounded CDN PNG requests with cache and expiry", async () => {
  const image = await png()
  const requests: string[] = []
  let now = 0
  const loader = new WelcomeEmojiLoader(
    async (input, options) => {
      requests.push(String(input))
      assert.equal(options?.redirect, "error")
      assert.ok(options?.signal)
      return new Response(image, { headers: { "content-type": "image/png" } })
    },
    () => now
  )
  const assets = await loadWelcomeEmojiAssets(
    welcomeTextTokens(
      "<:wave:123456789012345678> <a:dance:123456789012345678>",
      true
    ),
    loader
  )
  assert.equal(assets.size, 1)
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0],
    "https://cdn.discordapp.com/emojis/123456789012345678.png?size=64&quality=lossless"
  )
  await loader.loadCustom("123456789012345678")
  assert.equal(requests.length, 1)
  now = 600_001
  await loader.loadCustom("123456789012345678")
  assert.equal(requests.length, 2)
})
test("custom emoji failures use negative caching and never follow arbitrary URLs", async () => {
  let requests = 0
  let now = 0
  const loader = new WelcomeEmojiLoader(
    async () => {
      requests++
      throw new Error("timeout")
    },
    () => now
  )
  for (const invalid of [
    "https://evil.test",
    "../../etc/passwd",
    "123",
    "123456789012345678?url=evil",
  ])
    assert.equal(await loader.loadCustom(invalid), null)
  assert.equal(requests, 0)
  assert.equal(await loader.loadCustom("123456789012345678"), null)
  assert.equal(await loader.loadCustom("123456789012345678"), null)
  assert.equal(requests, 1)
  now = 60_001
  await loader.loadCustom("123456789012345678")
  assert.equal(requests, 2)
})
test("custom images reject deleted, redirected, malformed, oversized and unsupported responses", async () => {
  const image = await png()
  const largeDimensions = Buffer.from(image)
  largeDimensions.writeUInt32BE(99999, 16)
  const responses = [
    () => new Response(null, { status: 404 }),
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.test" },
      }),
    () =>
      new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    () =>
      new Response(image, {
        headers: { "content-type": "image/png", "content-length": "9999999" },
      }),
    () =>
      new Response(new Uint8Array(300_000), {
        headers: { "content-type": "image/png" },
      }),
    () => new Response("bad png", { headers: { "content-type": "image/png" } }),
    () =>
      new Response(largeDimensions, {
        headers: { "content-type": "image/png" },
      }),
  ]
  for (const response of responses)
    assert.equal(
      await new WelcomeEmojiLoader(async () => response()).loadCustom(
        "123456789012345678"
      ),
      null
    )
})
test("custom requests are coalesced and resource limits bound parallel work", async () => {
  let calls = 0
  const releases: (() => void)[] = []
  const loader = new WelcomeEmojiLoader(async () => {
    calls++
    await new Promise<void>((resolve) => releases.push(resolve))
    return new Response(null, { status: 404 })
  })
  const first = loader.loadCustom("123456789012345678")
  const duplicate = loader.loadCustom("123456789012345678")
  const rest = Array.from({ length: 8 }, (_, index) =>
    loader.loadCustom(String(223456789012345670n + BigInt(index)))
  )
  assert.equal(calls, 8)
  releases.forEach((release) => release())
  assert.deepEqual(
    await Promise.all([first, duplicate, ...rest]),
    Array(10).fill(null)
  )
})

test("custom fetches abort at the deadline and cache eviction remains bounded", async () => {
  const keepAlive = setTimeout(() => {}, 3000)
  try {
    const loader = new WelcomeEmojiLoader(
      async (_, options) =>
        await new Promise<Response>((_, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("deadline")),
            { once: true }
          )
        })
    )
    const start = Date.now()
    assert.equal(await loader.loadCustom("123456789012345678"), null)
    assert.ok(Date.now() - start < 2800)
  } finally {
    clearTimeout(keepAlive)
  }
  let calls = 0
  const loader = new WelcomeEmojiLoader(async () => {
    calls++
    return new Response(null, { status: 404 })
  })
  for (let index = 0; index < 129; index++)
    await loader.loadCustom(String(123456789012345678n + BigInt(index)))
  await loader.loadCustom("123456789012345678")
  assert.equal(calls, 130)
})

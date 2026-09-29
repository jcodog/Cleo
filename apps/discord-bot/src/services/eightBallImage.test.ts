import assert from "node:assert/strict"
import { test } from "node:test"

import { createCanvas, loadImage } from "@napi-rs/canvas"

import { eightBallResponses } from "./eightBall"
import { renderEightBallImage } from "./eightBallImage"

test("every answer renders a decodable PNG with visible text inside the triangle", async () => {
  for (const answer of eightBallResponses) {
    const image = await renderEightBallImage(answer)
    assert.deepEqual(
      image.subarray(0, 8),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
    const decoded = await loadImage(image)
    assert.equal(decoded.width, 1024)
    assert.equal(decoded.height, 1024)
    const ctx = createCanvas(1024, 1024).getContext("2d")
    ctx.drawImage(decoded, 0, 0)
    const pixels = ctx.getImageData(0, 0, 1024, 1024).data
    let textPixels = 0
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (
        (pixels[offset] ?? 0) < 220 ||
        (pixels[offset + 1] ?? 0) < 220 ||
        (pixels[offset + 2] ?? 0) < 220
      ) {
        continue
      }
      const x = (offset / 4) % 1024
      const y = Math.floor(offset / 4 / 1024)
      const halfWidth = (200 * (y - 330)) / (700 - 330)
      assert.ok(
        y > 330 && y < 700 && Math.abs(x - 512) < halfWidth,
        `Text outside triangle for ${answer}`
      )
      textPixels++
    }
    assert.ok(textPixels > 100, `Missing answer text for ${answer}`)
  }
})

test("rendering normalizes answer whitespace and capitalization", async () => {
  assert.deepEqual(
    await renderEightBallImage("  without\n a   doubt.  "),
    await renderEightBallImage("Without a doubt.")
  )
})

test("rendering rejects empty and unrenderable answers instead of truncating", async () => {
  await assert.rejects(renderEightBallImage(" \n "), /must not be empty/)
  await assert.rejects(renderEightBallImage("x".repeat(1000)), /does not fit/)
})

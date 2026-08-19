import assert from "node:assert/strict"
import { test } from "node:test"

import { renderEightBallImage } from "./eightBallImage"

test("renderEightBallImage returns a PNG buffer", () => {
  const image = renderEightBallImage("Without a doubt.")

  assert.ok(Buffer.isBuffer(image))
  assert.ok(image.length > 0)

  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])

  assert.deepEqual(image.subarray(0, 8), pngSignature)
})

test("renderEightBallImage handles longer wrapped answers", () => {
  const image = renderEightBallImage(
    "I wouldn't make any irreversible decisions yet."
  )

  assert.ok(Buffer.isBuffer(image))
  assert.ok(image.length > 0)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { FREE_WELCOME_STYLE } from "@workspace/shared/welcomeCard"

type Props = {
  children?: React.ReactNode
  "aria-label"?: string
  "aria-busy"?: boolean
  role?: string
  onChange?: (event: { target: { value: string } }) => void
}
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  return React.isValidElement<Props>(node)
    ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)]
    : []
}

test("preview renders and edits members, reports failures, waits for assets and aborts stale work", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const flush = async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve()
  }
  const slots: unknown[] = []
  let cursor = 0
  let effect: () => () => void = () => () => {}
  let failFonts = true
  let failDrawing = false
  let contextAvailable = true
  let autoImages = true
  let failImages = false
  let clearCount = 0
  let assetDraws = 0
  const drawnText: string[] = []
  const images: FakeImage[] = []
  class FakeImage {
    naturalWidth = 300
    naturalHeight = 150
    crossOrigin = ""
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    value = ""
    constructor() {
      images.push(this)
    }
    set src(value: string) {
      this.value = value
      if (value && autoImages)
        queueMicrotask(() => {
          if (failImages) this.onerror?.()
          else this.onload?.()
        })
    }
    get src() {
      return this.value
    }
  }
  class FakeFont {
    async load() {
      if (failFonts) throw new Error("Font unavailable")
      return this
    }
  }
  const gradient = { addColorStop() {} }
  const context = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    clearRect() {
      clearCount++
    },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillRect() {
      if (failDrawing) throw new Error("Canvas drawing failed")
    },
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    clip() {},
    roundRect() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    bezierCurveTo() {},
    fillText(text: string) {
      drawnText.push(text)
    },
    measureText(text: string) {
      return { width: text.length * 9 }
    },
    drawImage() {
      assetDraws++
    },
  }
  for (const [name, value] of Object.entries({
    React,
    Image: FakeImage,
    FontFace: FakeFont,
    document: { fonts: { add() {} } },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
  t.mock.module("react", {
    exports: {
      ...React,
      useId: () => "test-member",
      useRef: () => ({
        current: { getContext: () => (contextAvailable ? context : null) },
      }),
      useState: (initial: unknown) => {
        const index = cursor++
        if (!(index in slots)) slots[index] = initial
        return [
          slots[index],
          (value: unknown) => {
            slots[index] = value
          },
        ]
      },
      useEffect: (callback: () => () => void) => {
        effect = callback
      },
    },
  })
  t.mock.module("@workspace/ui/components/input", {
    exports: { Input: "input" },
  })
  const { WelcomeCardPreview, loadPreviewImage } =
    await import("./WelcomeCardPreview")
  let style = FREE_WELCOME_STYLE
  let subtext = "Hello 👩🏾‍💻"
  const render = (compact = false) => {
    cursor = 0
    return WelcomeCardPreview({ style, subtext, server: "Cleo HQ", compact })
  }
  const canvas = () => {
    const result = nodes(render()).find((node) => node.type === "canvas")
    assert.ok(result)
    return result.props
  }
  let cleanup: () => void = () => {}
  const update = async () => {
    cleanup()
    render()
    cleanup = effect()
    t.mock.timers.tick(150)
    await flush()
  }
  assert.equal(canvas()["aria-label"], "Welcome card preview unavailable")
  await update()
  assert.equal(canvas()["aria-label"], "Welcome card preview unavailable")
  assert.ok(clearCount >= 2)
  failFonts = false
  await update()
  assert.match(
    canvas()["aria-label"] ?? "",
    /Welcome card preview: Welcome, Alex Morgan 👋🏽/
  )
  assert.ok(assetDraws >= 2, "trusted 300px SVGs must render")
  const input = nodes(render()).find((node) => node.type === "input")
  assert.ok(input?.props.onChange)
  input.props.onChange({ target: { value: "🇬🇧 Family 👨‍👩‍👧‍👦" } })
  await update()
  assert.match(canvas()["aria-label"] ?? "", /Family 👨‍👩‍👧‍👦/)
  assert.ok(drawnText.includes("F"), "avatar chooses a textual initial")
  style = { ...style, greeting: "Hi {bad}" }
  await update()
  assert.equal(canvas()["aria-label"], "Welcome card preview unavailable")
  style = { ...FREE_WELCOME_STYLE, preset: "aurora" }
  failDrawing = true
  await update()
  assert.equal(canvas()["aria-label"], "Welcome card preview unavailable")
  failDrawing = false
  contextAvailable = false
  await update()
  assert.equal(canvas()["aria-label"], "Welcome card preview unavailable")
  contextAvailable = true
  failImages = true
  await update()
  assert.equal(canvas()["aria-label"], "Welcome card preview unavailable")
  failImages = false
  autoImages = false
  await update()
  assert.equal(canvas()["aria-busy"], true)
  const waiting = images.filter((image) => image.onload !== null)
  const before = assetDraws
  cleanup()
  assert.ok(
    waiting.every(
      (image) =>
        image.onload === null && image.onerror === null && image.src === ""
    )
  )
  await flush()
  assert.equal(assetDraws, before, "aborted work must never paint")
  autoImages = true
  subtext = "<:wave:123456789012345678>"
  await update()
  assert.ok(
    drawnText.some((text) => text.includes(":wave:")),
    "oversized custom images use readable fallback"
  )
  cleanup()
  render()
  cleanup = effect()
  cleanup()
  t.mock.timers.tick(150)
  await flush()
  assert.equal(assetDraws, before + 2, "a cancelled debounce cannot render")
  assert.equal(
    nodes(render(true)).some((node) => node.type === "input"),
    false
  )

  const abort = new AbortController()
  abort.abort()
  assert.equal(
    await loadPreviewImage({ kind: "local", key: "1f44b" }, abort.signal),
    null
  )
  autoImages = false
  const pending = loadPreviewImage(
    { kind: "local", key: "1f44b" },
    new AbortController().signal
  )
  t.mock.timers.tick(2000)
  assert.equal(await pending, null)
  const custom = loadPreviewImage(
    { kind: "custom", id: "123456789012345678" },
    new AbortController().signal
  )
  const last = images.at(-1)
  assert.ok(last)
  last.naturalWidth = 64
  last.naturalHeight = 64
  last.onload?.()
  assert.equal(await custom, last)
  const firefox = loadPreviewImage(
    { kind: "local", key: "1f44b" },
    new AbortController().signal
  )
  const svg = images.at(-1)
  assert.ok(svg)
  svg.naturalWidth = 0
  svg.naturalHeight = 0
  svg.onload?.()
  assert.equal(await firefox, svg)
})

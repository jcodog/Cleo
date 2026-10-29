import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"

test("native Liquid Glass uses availability guards and follows Reduce Transparency with an opaque fallback", async (t) => {
  let reduced = true,
    available = true,
    liquid = true,
    removed = false
  let changed: ((value: boolean) => void) | undefined
  let cleanup: (() => void) | undefined
  t.mock.module("react", {
    exports: {
      ...React,
      useState: () => [
        reduced,
        (value: boolean) => {
          reduced = value
        },
      ],
      useEffect: (effect: () => () => void) => {
        if (!cleanup) cleanup = effect()
      },
    },
  })
  t.mock.module("react-native", {
    exports: {
      View: "View",
      StyleSheet: { create: (value: unknown) => value },
      AccessibilityInfo: {
        isReduceTransparencyEnabled: async () => false,
        addEventListener: (
          _event: string,
          callback: (value: boolean) => void
        ) => {
          changed = callback
          return {
            remove: () => {
              removed = true
            },
          }
        },
      },
    },
  })
  t.mock.module("expo-glass-effect", {
    exports: {
      GlassView: "GlassView",
      isGlassEffectAPIAvailable: () => available,
      isLiquidGlassAvailable: () => liquid,
    },
  })
  const previous = Object.getOwnPropertyDescriptor(globalThis, "React")
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: React,
  })
  t.after(() => {
    cleanup?.()
    if (previous) Object.defineProperty(globalThis, "React", previous)
    else Reflect.deleteProperty(globalThis, "React")
  })
  const { NativeGlass } = await import("./NativeGlass")
  const render = () => NativeGlass({ children: "Account", interactive: true })
  assert.equal(
    render().type,
    "View",
    "Stay opaque until accessibility preferences load"
  )
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(render().type, "GlassView")
  assert.equal(render().props.isInteractive, true)
  assert.equal(render().props.colorScheme, "dark")
  changed?.(true)
  assert.equal(render().type, "View")
  changed?.(false)
  available = false
  assert.equal(
    render().type,
    "View",
    "Unsupported runtime must not instantiate the native effect"
  )
  available = true
  liquid = false
  assert.equal(
    render().type,
    "View",
    "Unsupported compiler or app configuration uses solid controls"
  )
  cleanup?.()
  assert.equal(removed, true)
})

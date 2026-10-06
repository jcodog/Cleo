import * as React from "react"
import assert from "node:assert/strict"
import { test } from "node:test"

test("copied landing theme handles click, hotkey, system changes and blocked storage", async (t) => {
  const previous = new Map<string, PropertyDescriptor | undefined>()
  function install(name: string, value: unknown) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, value })
  }
  t.after(() => {
    cleanups.forEach((cleanup) => cleanup())
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  })
  install("React", React)
  class Element {
    constructor(
      public tagName: string,
      public isContentEditable = false
    ) {}
  }
  install("HTMLElement", Element)
  const storage = new Map<string, string>([["theme", "dark"]])
  let storageBlocked = false
  const classes = new Set<string>()
  const style: Record<string, string> = {}
  const keyHandlers = new Set<(event: object) => void>()
  const mediaHandlers = new Set<() => void>()
  const media = {
    matches: false,
    addEventListener: (_name: string, listener: () => void) =>
      mediaHandlers.add(listener),
    removeEventListener: (_name: string, listener: () => void) =>
      mediaHandlers.delete(listener),
  }
  install("document", {
    documentElement: {
      style,
      classList: {
        toggle: (name: string, enabled: boolean) => {
          if (enabled) classes.add(name)
          else classes.delete(name)
        },
      },
    },
  })
  install("window", {
    localStorage: {
      getItem: (key: string) => {
        if (storageBlocked) throw new Error("blocked")
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (storageBlocked) throw new Error("blocked")
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        if (storageBlocked) throw new Error("blocked")
        storage.delete(key)
      },
    },
    matchMedia: (query: string) => {
      assert.equal(query, "(prefers-color-scheme: dark)")
      return media
    },
    addEventListener: (name: string, listener: (event: object) => void) => {
      assert.equal(name, "keydown")
      keyHandlers.add(listener)
    },
    removeEventListener: (name: string, listener: (event: object) => void) => {
      assert.equal(name, "keydown")
      keyHandlers.delete(listener)
    },
  })
  let theme = "system"
  let systemTheme = "light"
  let hydrated = false
  let stateIndex = 0
  let context: {
    resolvedTheme: string
    setTheme: (value: string) => void
  } | null = null
  let mount: (() => void) | undefined
  let effects: (() => void | (() => void))[] = []
  let cleanups: (() => void)[] = []
  t.mock.module("react", {
    exports: {
      ...React,
      useState: () =>
        [
          [
            theme,
            (value: string) => {
              theme = value
            },
          ],
          [
            systemTheme,
            (value: string) => {
              systemTheme = value
            },
          ],
          [
            hydrated,
            (value: boolean) => {
              hydrated = value
            },
          ],
        ][stateIndex++],
      useLayoutEffect: (callback: () => void) => {
        mount ??= callback
      },
      useEffect: (callback: () => void | (() => void)) =>
        effects.push(callback),
      useMemo: (factory: () => unknown) => factory(),
      useContext: () => context,
    },
  })
  const { ThemeProvider, useTheme } = await import("./theme-provider")
  const { ThemeToggle } = await import("../ThemeToggle")
  function render() {
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
    effects = []
    stateIndex = 0
    const provider = ThemeProvider({ children: "marketing" })
    context = provider.props.value
    const hotkey = provider.props.children[0]
    hotkey.type(hotkey.props)
    for (const callback of effects) {
      const cleanup = callback()
      if (cleanup) cleanups.push(cleanup)
    }
  }
  function assertTheme(expected: "dark" | "light") {
    assert.equal(classes.has("dark"), expected === "dark")
    assert.equal(style.colorScheme, expected)
    assert.equal(
      style.backgroundColor,
      expected === "dark" ? "#0a0a0b" : "#ffffff"
    )
  }
  function press(overrides: object = {}) {
    const event = {
      key: "d",
      defaultPrevented: false,
      repeat: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      target: new Element("BUTTON"),
      ...overrides,
    }
    for (const listener of keyHandlers) listener(event)
  }
  render()
  assert.ok(mount)
  mount()
  await Promise.resolve()
  render()
  assertTheme("dark")
  const toggle = ThemeToggle()
  toggle.props.children[0].props.render.props.onClick()
  render()
  assertTheme("light")
  assert.equal(storage.get("theme"), "light")
  for (const overrides of [
    { defaultPrevented: true },
    { repeat: true },
    { metaKey: true },
    { ctrlKey: true },
    { altKey: true },
    { key: "x" },
    { target: new Element("INPUT") },
    { target: new Element("TEXTAREA") },
    { target: new Element("SELECT") },
    { target: new Element("DIV", true) },
  ]) {
    press(overrides)
    render()
    assertTheme("light")
    assert.equal(storage.get("theme"), "light")
  }
  press({ key: "D", target: null })
  render()
  assertTheme("dark")
  assert.equal(storage.get("theme"), "dark")
  useTheme().setTheme("system")
  assert.equal(storage.has("theme"), false)
  render()
  assertTheme("light")
  media.matches = true
  mediaHandlers.forEach((listener) => listener())
  render()
  assertTheme("dark")
  storageBlocked = true
  ThemeToggle().props.children[0].props.render.props.onClick()
  render()
  assertTheme("light")
  assert.equal(storage.has("theme"), false)
  storageBlocked = false
  storage.set("theme", "light")
  theme = "system"
  hydrated = false
  mount()
  await Promise.resolve()
  render()
  assertTheme("light")
  assert.equal(storage.get("theme"), "light")
  context = null
  assert.throws(useTheme, /must be used within ThemeProvider/)
})

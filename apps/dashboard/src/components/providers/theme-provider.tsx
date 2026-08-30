"use client"

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = Exclude<Theme, "system">

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = "theme"
const ThemeContext = createContext<ThemeContextValue | null>(null)

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system")
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light")
  const [isHydrated, setIsHydrated] = useState(false)
  const resolvedTheme = theme === "system" ? systemTheme : theme

  useLayoutEffect(() => {
    queueMicrotask(() => {
      setThemeState(getStoredTheme())
      setSystemTheme(getSystemTheme())
      setIsHydrated(true)
    })
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const updateSystemTheme = () => setSystemTheme(getSystemTheme())

    mediaQuery.addEventListener("change", updateSystemTheme)

    return () => {
      mediaQuery.removeEventListener("change", updateSystemTheme)
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    const root = document.documentElement

    root.classList.toggle("dark", resolvedTheme === "dark")
    root.style.colorScheme = resolvedTheme
    root.style.backgroundColor =
      resolvedTheme === "dark" ? "#0a0a0b" : "#ffffff"
  }, [isHydrated, resolvedTheme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme(nextTheme) {
        setThemeState(nextTheme)

        try {
          if (nextTheme === "system") {
            window.localStorage.removeItem(STORAGE_KEY)
          } else {
            window.localStorage.setItem(STORAGE_KEY, nextTheme)
          }
        } catch {
          // The in-memory preference still works when browser storage is blocked.
        }
      },
    }),
    [theme, resolvedTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.")
  }

  return context
}

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system"
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system"
  }

  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY)

    return isTheme(storedTheme) ? storedTheme : "system"
  } catch {
    return "system"
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light"
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, useTheme }

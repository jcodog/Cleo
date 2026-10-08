"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Input } from "@workspace/ui/components/input"
import {
  drawWelcomeCard,
  welcomeCardText,
} from "@workspace/shared/drawWelcomeCard"
import {
  DEFAULT_WELCOME_SUBTEXT,
  WELCOME_CARD_SIZE,
  WELCOME_FONT_SUBSETS,
  parseWelcomeCardStyle,
  type WelcomeCardStyle,
} from "@workspace/shared/welcomeCard"

let fontsReady: Promise<void> | undefined
function loadFonts(): Promise<void> {
  fontsReady ??= Promise.all(
    WELCOME_FONT_SUBSETS.flatMap((subset) =>
      [400, 600, 700, 800].map(async (weight) => {
        const font = new FontFace(
          `Cleo Geist ${subset}`,
          `url(/welcome-assets/fonts/geist-${subset}-${weight}-normal.woff)`,
          { weight: String(weight) }
        )
        document.fonts.add(await font.load())
      })
    )
  )
    .then(() => undefined)
    .catch((error: unknown) => {
      fontsReady = undefined
      throw error
    })
  return fontsReady
}

type PreviewImageSource =
  { kind: "local"; key: string } | { kind: "custom"; id: string }
export async function loadPreviewImage(
  source: PreviewImageSource,
  signal: AbortSignal
): Promise<HTMLImageElement | null> {
  if (signal.aborted) return null
  // Local SVGs are trusted and may have a browser-default intrinsic size.
  // Only external Discord PNGs need the bounded intrinsic-dimension guard.
  const url =
    source.kind === "local"
      ? `/welcome-assets/emoji/${source.key}.svg`
      : `https://cdn.discordapp.com/emojis/${source.id}.png?size=64&quality=lossless`
  const image = new Image()
  image.crossOrigin = "anonymous"
  return await new Promise((resolve) => {
    let settled = false
    function finish(result: HTMLImageElement | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      image.onload = null
      image.onerror = null
      if (!result) image.src = ""
      resolve(result)
    }
    function abort() {
      finish(null)
    }
    const timer = setTimeout(abort, 2000)
    signal.addEventListener("abort", abort, { once: true })
    image.onload = () =>
      finish(
        source.kind === "local" ||
          (image.naturalWidth > 0 &&
            image.naturalHeight > 0 &&
            image.naturalWidth <= 256 &&
            image.naturalHeight <= 256)
          ? image
          : null
      )
    image.onerror = abort
    image.src = url
  })
}

type PreviewState =
  | { phase: "loading" | "error"; message: string }
  | { phase: "ready"; label: string }
export function WelcomeCardPreview({
  style,
  subtext,
  server,
  compact = false,
}: {
  style: WelcomeCardStyle
  subtext: string
  server: string
  compact?: boolean
}) {
  const memberId = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<PreviewState>({
    phase: "loading",
    message: "Preparing preview…",
  })
  const [sampleMember, setSampleMember] = useState(
    compact ? "Alex Morgan" : "Alex Morgan 👋🏽"
  )
  useEffect(() => {
    const abort = new AbortController()
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    async function render() {
      try {
        setState({ phase: "loading", message: "Updating preview…" })
        if (!context) throw new Error("Canvas is unavailable")
        context.clearRect(
          0,
          0,
          WELCOME_CARD_SIZE.width,
          WELCOME_CARD_SIZE.height
        )
        const validatedStyle = parseWelcomeCardStyle(style)
        const copy = {
          member: sampleMember,
          server,
          subtext: subtext || DEFAULT_WELCOME_SUBTEXT,
        }
        await loadFonts()
        if (abort.signal.aborted) return
        const text = welcomeCardText(copy, validatedStyle)
        const requests = new Map<string, PreviewImageSource>()
        let customCount = 0
        for (const token of [...text.heading, ...text.title, ...text.subtext]) {
          if (token.kind === "emoji")
            requests.set(`emoji:${token.key}`, {
              kind: "local",
              key: token.key,
            })
          if (
            token.kind === "custom" &&
            !requests.has(`custom:${token.id}`) &&
            customCount < 8
          ) {
            requests.set(`custom:${token.id}`, { kind: "custom", id: token.id })
            customCount++
          }
        }
        const assets = new Map<string, HTMLImageElement>()
        await Promise.all(
          Array.from(requests, async ([key, source]) => {
            const image = await loadPreviewImage(source, abort.signal)
            if (image) assets.set(key, image)
            else if (source.kind === "local" && !abort.signal.aborted)
              throw new Error("Emoji artwork unavailable")
          })
        )
        if (abort.signal.aborted) return
        drawWelcomeCard(
          context,
          copy,
          (key, x, y, size) => {
            const image = assets.get(key)
            if (!image) return false
            context.drawImage(image, x, y, size, size)
            return true
          },
          validatedStyle,
          (key) => assets.has(key)
        )
        setState({
          phase: "ready",
          label: `Welcome card preview: ${text.title.map((token) => (token.kind === "custom" ? `:${token.name}:` : token.value)).join("")}. ${copy.subtext}`,
        })
      } catch {
        if (!abort.signal.aborted) {
          context?.clearRect(
            0,
            0,
            WELCOME_CARD_SIZE.width,
            WELCOME_CARD_SIZE.height
          )
          setState({
            phase: "error",
            message:
              "Preview unavailable. Check your greeting or connection, then edit a field to try again.",
          })
          abort.abort()
        }
      }
    }
    const timer = setTimeout(
      () => {
        void render()
      },
      compact ? 0 : 150
    )
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [style, subtext, server, sampleMember, compact])
  return (
    <div className={compact ? "pointer-events-none" : "space-y-4"}>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950 shadow-xl shadow-black/20">
        <canvas
          ref={canvasRef}
          width={WELCOME_CARD_SIZE.width}
          height={WELCOME_CARD_SIZE.height}
          role="img"
          aria-label={
            state.phase === "ready"
              ? state.label
              : "Welcome card preview unavailable"
          }
          aria-busy={state.phase === "loading"}
          className="block h-auto w-full"
        />
      </div>
      {!compact && (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p
              role="status"
              aria-live="polite"
              className={state.phase === "error" ? "text-amber-400" : ""}
            >
              {state.phase === "ready"
                ? "Preview updated. No message will be sent."
                : state.message}
            </p>
            <span className="shrink-0 font-mono">960 × 360</span>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={memberId}>
              Try a member name
            </label>
            <Input
              id={memberId}
              maxLength={120}
              value={sampleMember}
              onChange={(event) => setSampleMember(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Test long names and emoji to see how your card fits.
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Emoji artwork by Twemoji, licensed under{" "}
            <a
              className="underline underline-offset-2"
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>
            . Animated Discord emoji use a still frame. Unavailable custom emoji
            show their name.
          </p>
        </>
      )}
    </div>
  )
}

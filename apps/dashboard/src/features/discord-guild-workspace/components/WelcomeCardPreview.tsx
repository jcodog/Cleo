"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@workspace/ui/components/input"
import {
  drawWelcomeCard,
  welcomeCardText,
} from "@workspace/shared/drawWelcomeCard"
import {
  DEFAULT_WELCOME_SUBTEXT,
  WELCOME_CARD_SIZE,
  welcomeGraphemes,
  welcomeTextTokens,
  parseWelcomeCardStyle,
  type WelcomeCardStyle,
} from "@workspace/shared/welcomeCard"

let fontsReady: Promise<void> | undefined
function loadFonts(): Promise<void> {
  fontsReady ??= Promise.all(
    ["latin", "latin-ext", "cyrillic"].flatMap((subset) =>
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

async function loadPreviewImage(
  url: string,
  signal: AbortSignal
): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.crossOrigin = "anonymous"
  return await new Promise((resolve) => {
    function finish(result: HTMLImageElement | null) {
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
        image.naturalWidth <= 256 && image.naturalHeight <= 256 ? image : null
      )
    image.onerror = abort
    image.src = url
  })
}

export function WelcomeCardPreview({
  style,
  subtext,
  server,
}: {
  style: WelcomeCardStyle
  subtext: string
  server: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState("Preparing preview…")
  const [sampleMember, setSampleMember] = useState("New member 👋🏽")
  useEffect(() => {
    const abort = new AbortController()
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    const copy = {
      member: sampleMember,
      server,
      subtext: subtext || DEFAULT_WELCOME_SUBTEXT,
    }
    async function render() {
      try {
        setStatus("Updating preview…")
        const validatedStyle = parseWelcomeCardStyle(style)
        await loadFonts()
        if (abort.signal.aborted) return
        const text = welcomeCardText(copy, validatedStyle)
        const requests = new Map<string, string>()
        for (const token of [
          ...text.title,
          ...text.subtext,
          ...welcomeTextTokens(welcomeGraphemes(copy.member)[0] ?? "C"),
        ]) {
          if (token.kind === "emoji")
            requests.set(
              `emoji:${token.key}`,
              `/welcome-assets/emoji/${token.key}.svg`
            )
          if (
            token.kind === "custom" &&
            Array.from(requests.keys()).filter((key) =>
              key.startsWith("custom:")
            ).length < 8
          )
            requests.set(
              `custom:${token.id}`,
              `https://cdn.discordapp.com/emojis/${token.id}.png?size=64&quality=lossless`
            )
        }
        const assets = new Map<string, HTMLImageElement>()
        await Promise.all(
          Array.from(requests, async ([key, url]) => {
            const image = await loadPreviewImage(url, abort.signal)
            if (image) assets.set(key, image)
          })
        )
        if (abort.signal.aborted || !context) return
        drawWelcomeCard(
          context,
          copy,
          (key, x, y, size) => {
            const image = assets.get(key)
            if (!image) return false
            context.drawImage(image, x, y, size, size)
            return true
          },
          validatedStyle
        )
        setStatus("Preview updated. Example member, no message will be sent.")
      } catch {
        if (!abort.signal.aborted) {
          context?.clearRect(
            0,
            0,
            WELCOME_CARD_SIZE.width,
            WELCOME_CARD_SIZE.height
          )
          setStatus(
            "Preview unavailable. Check the greeting and your connection, then try again."
          )
        }
      }
    }
    const timer = setTimeout(() => {
      void render()
    }, 150)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [style, subtext, server, sampleMember])
  return (
    <div className="space-y-3">
      <label
        className="block text-sm font-medium"
        htmlFor="welcome-preview-member"
      >
        Preview member name
      </label>
      <Input
        id="welcome-preview-member"
        maxLength={120}
        value={sampleMember}
        onChange={(event) => setSampleMember(event.target.value)}
      />
      <canvas
        ref={canvasRef}
        width={WELCOME_CARD_SIZE.width}
        height={WELCOME_CARD_SIZE.height}
        role="img"
        aria-label={`Welcome card preview: ${welcomeCardText(
          {
            member: sampleMember,
            server,
            subtext: subtext || DEFAULT_WELCOME_SUBTEXT,
          },
          style
        )
          .title.map((token) =>
            token.kind === "custom" ? `:${token.name}:` : token.value
          )
          .join("")}. ${subtext || DEFAULT_WELCOME_SUBTEXT}`}
        className="h-auto w-full rounded-lg border"
      />
      <p
        className="text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
      <p className="text-xs text-muted-foreground">
        Emoji artwork by Twemoji, licensed under{" "}
        <a
          className="underline"
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
        . Animated Discord emoji use a still frame. Unavailable custom emoji
        show their name.
      </p>
    </div>
  )
}

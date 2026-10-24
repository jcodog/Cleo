import { CUSTOM_DISCORD_EMOJI, UNICODE_EMOJI } from "./patterns"
import type { ModerationEmote } from "./types"

export const graphemeSegmenter = new Intl.Segmenter("en", {
  granularity: "grapheme",
})

export function analyseEmotes(
  content: string,
  supplied: readonly ModerationEmote[]
) {
  const segments = Array.from(graphemeSegmenter.segment(content))
  const boundaries = new Set(segments.map((segment) => segment.index))
  boundaries.add(content.length)
  const spans: ModerationEmote[] = [...supplied]
  for (const match of content.matchAll(CUSTOM_DISCORD_EMOJI)) {
    spans.push({ start: match.index, end: match.index + match[0].length })
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end)
  const unique: ModerationEmote[] = []
  for (const span of spans) {
    if (
      span.end <= span.start ||
      !boundaries.has(span.start) ||
      !boundaries.has(span.end)
    ) {
      throw new RangeError(
        "Emote ranges must cover complete graphemes in the original message."
      )
    }
    const previous = unique.at(-1)
    if (previous && span.start < previous.end) {
      if (span.start === previous.start && span.end === previous.end) continue
      throw new RangeError("Emote ranges must not overlap.")
    }
    unique.push(span)
  }
  let emojiCount = 0
  let spanIndex = 0
  for (const segment of segments) {
    let span = unique[spanIndex]
    while (span && segment.index >= span.end) {
      span = unique[++spanIndex]
    }
    if (
      (!span || segment.index < span.start) &&
      UNICODE_EMOJI.test(segment.segment) &&
      !segment.segment.includes("\ufe0e")
    )
      emojiCount++
  }
  let analysisText = ""
  let offset = 0
  for (const span of unique) {
    analysisText += content.slice(offset, span.start) + " "
    offset = span.end
  }
  analysisText += content.slice(offset)
  return { emojiCount, emoteCount: unique.length, analysisText }
}

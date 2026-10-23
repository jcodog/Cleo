import { z } from "zod"
import { normalizeComparisonText } from "./normalize"
import {
  INVISIBLE_OR_WHITESPACE,
  LETTER,
  LETTER_OR_NUMBER,
  UPPERCASE_LETTER,
  UNICODE_EMOJI,
} from "./patterns"
import {
  boundedArray,
  MODERATION_LIMITS,
  type ModerationHistoryEntry,
  type NormalizedModerationMessage,
} from "./types"

export function characterStatistics(graphemes: readonly string[]) {
  let letters = 0
  let uppercase = 0
  let symbols = 0
  let visible = 0
  let longestRun = 0
  let run = 0
  let previous = ""
  for (const grapheme of graphemes) {
    if (/^\s+$/u.test(grapheme)) {
      run = 0
      previous = ""
      continue
    }
    if (INVISIBLE_OR_WHITESPACE.test(grapheme)) continue
    visible++
    if (!LETTER_OR_NUMBER.test(grapheme)) symbols++
    for (const codepoint of grapheme) {
      if (LETTER.test(codepoint)) letters++
      if (UPPERCASE_LETTER.test(codepoint)) uppercase++
    }
    const canonical = grapheme.normalize("NFKC")
    // Joiners and selectors inside letters should not conceal a visual run.
    // Preserve them inside emoji, where they distinguish different glyphs.
    const comparable = UNICODE_EMOJI.test(grapheme)
      ? canonical
      : canonical.replace(/[\p{Cf}\p{Variation_Selector}]/gu, "")
    run = comparable === previous ? run + 1 : 1
    previous = comparable
    longestRun = Math.max(longestRun, run)
  }
  return { letters, uppercase, symbols, visible, longestRun }
}

const wordSegmenter = new Intl.Segmenter("en", { granularity: "word" })

/** Linear in token count times the bounded phrase width, even for identical tokens. */
export function phraseRepetition(
  text: string,
  minimumWords: number,
  maximumWords: number
) {
  const words = Array.from(wordSegmenter.segment(normalizeComparisonText(text)))
    .filter((part) => part.isWordLike)
    .map((part) => part.segment)
  let repetitions = 0
  let phraseWords = 0
  for (let width = minimumWords; width <= maximumWords; width++) {
    let equalRun = 0
    for (let index = words.length - width - 1; index >= 0; index--) {
      equalRun = words[index] === words[index + width] ? equalRun + 1 : 0
      const count = 1 + Math.floor(equalRun / width)
      if (count > repetitions) {
        repetitions = count
        phraseWords = width
      }
    }
  }
  return { repetitions, phraseWords }
}

const identity = z.string().min(1).max(MODERATION_LIMITS.identityLength)
const historySchema = boundedArray(
  z.strictObject({
    id: identity,
    scopeId: identity,
    authorId: identity,
    content: z.string().max(MODERATION_LIMITS.messageLength),
    timestamp: z.number().int().nonnegative().safe(),
  }),
  MODERATION_LIMITS.historyEntries
).superRefine((entries, ctx) => {
  if (
    entries.reduce((total, entry) => total + entry.content.length, 0) >
    MODERATION_LIMITS.historyTextLength
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Recent message history exceeds its total text budget.",
    })
  }
})

export function recentMessageCounts(
  message: NormalizedModerationMessage,
  history: readonly ModerationHistoryEntry[],
  now: number,
  duplicateWindowMs: number,
  floodWindowMs: number
) {
  const entries = historySchema.parse(history)
  let duplicateCount = 1
  let floodCount = 1
  const seen = new Set([message.original.id])
  for (const entry of entries) {
    if (
      entry.scopeId !== message.original.scopeId ||
      entry.authorId !== message.original.authorId ||
      entry.timestamp > now ||
      seen.has(entry.id)
    )
      continue
    seen.add(entry.id)
    const age = now - entry.timestamp
    if (age <= floodWindowMs) floodCount++
    if (
      age <= duplicateWindowMs &&
      normalizeComparisonText(entry.content) === message.comparisonText
    )
      duplicateCount++
  }
  return { duplicateCount, floodCount }
}

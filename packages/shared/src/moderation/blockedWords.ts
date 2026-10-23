import { normalizeComparisonText } from "./normalize"
import { VISIBLE_TERM, WORD_END, WORD_START } from "./patterns"
import type { BlockedWord } from "./types"

export type CompiledBlockedWord = Readonly<{ term: string; wholeWord: boolean }>

export function compileBlockedWords(
  entries: readonly BlockedWord[]
): readonly CompiledBlockedWord[] {
  const seen = new Set<string>()
  return Object.freeze(
    entries.map((entry) => {
      const term = normalizeComparisonText(entry.term)
      if (!VISIBLE_TERM.test(term))
        throw new RangeError("Blocked terms must contain visible text.")
      if (seen.has(term))
        throw new RangeError(
          "Blocked terms must be unique after normalisation."
        )
      seen.add(term)
      return Object.freeze({ term, wholeWord: entry.wholeWord })
    })
  )
}

export function matchBlockedWords(
  text: string,
  entries: readonly CompiledBlockedWord[]
): readonly number[] {
  const matches: number[] = []
  entries.forEach((entry, entryIndex) => {
    let offset = text.indexOf(entry.term)
    while (offset !== -1) {
      const end = offset + entry.term.length
      if (
        !entry.wholeWord ||
        (!WORD_END.test(text.slice(Math.max(0, offset - 2), offset)) &&
          !WORD_START.test(text.slice(end, end + 2)))
      ) {
        matches.push(entryIndex)
        break
      }
      offset = text.indexOf(entry.term, offset + 1)
    }
  })
  return matches
}

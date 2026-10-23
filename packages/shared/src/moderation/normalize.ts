import { z } from "zod"
import { analyseEmotes, graphemeSegmenter } from "./emoji"
import {
  boundedArray,
  MODERATION_LIMITS,
  type ModerationMessage,
  type NormalizedModerationMessage,
} from "./types"

const identity = z.string().min(1).max(MODERATION_LIMITS.identityLength)
export const moderationMessageSchema = z
  .strictObject({
    id: identity,
    scopeId: identity,
    authorId: identity,
    content: z.string().max(MODERATION_LIMITS.messageLength),
    roleIds: boundedArray(identity, MODERATION_LIMITS.identities)
      .readonly()
      .optional(),
    isModerator: z.boolean().optional(),
    isAdministrator: z.boolean().optional(),
    emotes: boundedArray(
      z
        .strictObject({
          start: z
            .number()
            .int()
            .nonnegative()
            .max(MODERATION_LIMITS.messageLength),
          end: z.number().int().positive().max(MODERATION_LIMITS.messageLength),
        })
        .readonly(),
      MODERATION_LIMITS.emotes
    )
      .readonly()
      .optional(),
  })
  .readonly()

/** Canonical equivalence and whitespace folding, without joining invisible-separated words. */
export function normalizeComparisonText(content: string): string {
  return content
    .normalize("NFC")
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
}

export function normalizeModerationMessage(
  message: ModerationMessage
): NormalizedModerationMessage {
  const original = moderationMessageSchema.parse(message)
  const emotes = analyseEmotes(original.content, original.emotes ?? [])
  const text = original.content.normalize("NFC")
  const analysisText = emotes.analysisText.normalize("NFC")
  return Object.freeze({
    original,
    text,
    comparisonText: normalizeComparisonText(text),
    analysisText,
    graphemes: Object.freeze(
      Array.from(
        graphemeSegmenter.segment(analysisText),
        ({ segment }) => segment
      )
    ),
    emojiCount: emotes.emojiCount,
    emoteCount: emotes.emoteCount,
  })
}

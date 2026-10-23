import { z } from "zod"

export const MODERATION_LIMITS = {
  messageLength: 8192,
  historyEntries: 256,
  historyTextLength: 65536,
  emotes: 256,
  blockedEntries: 50,
  blockedTermLength: 128,
  allowedDomains: 100,
  identities: 100,
  identityLength: 128,
} as const

export const MODERATION_RULE_ORDER = [
  "links",
  "discordInvites",
  "uppercase",
  "emojiSpam",
  "symbolSpam",
  "repeatedCharacters",
  "duplicateMessages",
  "flooding",
  "repeatedPhrases",
  "blockedWords",
] as const

export type ModerationRuleId = (typeof MODERATION_RULE_ORDER)[number]
export type ModerationSeverity = "low" | "medium" | "high"

// Reject oversized arrays before parsing their elements.
export function boundedArray<T extends z.ZodType>(element: T, maximum: number) {
  return z
    .unknown()
    .refine(
      (value) => Array.isArray(value) && value.length <= maximum,
      `Expected an array with at most ${maximum} entries.`
    )
    .pipe(z.array(element))
}

const identity = z.string().min(1).max(MODERATION_LIMITS.identityLength)
const identityList = boundedArray(identity, MODERATION_LIMITS.identities)
  .default([])
  .readonly()

export const moderationActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("log") }).readonly(),
  z.strictObject({ kind: z.literal("warn") }).readonly(),
  z.strictObject({ kind: z.literal("delete") }).readonly(),
  z
    .strictObject({
      kind: z.literal("timeout"),
      durationSeconds: z
        .number()
        .int()
        .min(1)
        .max(28 * 24 * 60 * 60),
    })
    .readonly(),
])

export type ModerationAction = z.infer<typeof moderationActionSchema>

export const moderationExemptionsSchema = z
  .strictObject({
    userIds: identityList,
    roleIds: identityList,
    moderators: z.boolean().default(false),
    administrators: z.boolean().default(false),
  })
  .readonly()

export type ModerationExemptions = z.infer<typeof moderationExemptionsSchema>

const baseRule = {
  enabled: z.boolean().default(false),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  action: moderationActionSchema.prefault({ kind: "log" }),
  exemptions: moderationExemptionsSchema.prefault({}),
}

function rule<T extends z.ZodRawShape>(settings: T) {
  return z.strictObject({ ...baseRule, ...settings }).readonly()
}

const percentage = z.number().min(0).max(100)
const messageCount = z.number().int().min(2).max(256)
const windowMs = z
  .number()
  .int()
  .min(1)
  .max(5 * 60 * 1000)

export const blockedWordSchema = z
  .strictObject({
    term: z.string().min(1).max(MODERATION_LIMITS.blockedTermLength),
    wholeWord: z.boolean().default(true),
  })
  .readonly()

export type BlockedWord = z.infer<typeof blockedWordSchema>

export const moderationPolicySchema = z
  .strictObject({
    revision: z.number().int().nonnegative().safe().default(0),
    exemptions: moderationExemptionsSchema.prefault({
      moderators: true,
      administrators: true,
    }),
    rules: z
      .strictObject({
        links: rule({
          allowedDomains: boundedArray(
            z.string().min(1).max(253),
            MODERATION_LIMITS.allowedDomains
          )
            .default([])
            .readonly(),
          allowSubdomains: z.boolean().default(true),
        }).prefault({}),
        discordInvites: rule({}).prefault({}),
        uppercase: rule({
          percentage: percentage.default(75),
          minimumLetters: z.number().int().min(1).max(8192).default(8),
        }).prefault({}),
        emojiSpam: rule({
          maximum: z.number().int().min(0).max(8192).default(5),
        }).prefault({}),
        symbolSpam: rule({ percentage: percentage.default(60) }).prefault({}),
        repeatedCharacters: rule({
          minimum: z.number().int().min(2).max(8192).default(6),
        }).prefault({}),
        duplicateMessages: rule({
          minimum: messageCount.default(3),
          windowMs: windowMs.default(30000),
        }).prefault({}),
        flooding: rule({
          minimum: messageCount.default(5),
          windowMs: windowMs.default(10000),
        }).prefault({}),
        repeatedPhrases: rule({
          minimumRepetitions: z.number().int().min(2).max(8192).default(3),
          minimumWords: z.number().int().min(1).max(16).default(2),
          maximumWords: z.number().int().min(1).max(16).default(8),
        }).prefault({}),
        blockedWords: rule({
          entries: boundedArray(
            blockedWordSchema,
            MODERATION_LIMITS.blockedEntries
          )
            .default([])
            .readonly(),
        }).prefault({}),
      })
      .readonly()
      .prefault({}),
  })
  .readonly()

export type ModerationPolicy = z.infer<typeof moderationPolicySchema>

/** Platform adapters supply exclusive UTF-16 offsets into the original content. */
export type ModerationEmote = Readonly<{ start: number; end: number }>

export type ModerationMessage = Readonly<{
  id: string
  scopeId: string
  authorId: string
  content: string
  roleIds?: readonly string[]
  isModerator?: boolean
  isAdministrator?: boolean
  emotes?: readonly ModerationEmote[]
}>

export type ModerationHistoryEntry = Readonly<{
  id: string
  scopeId: string
  authorId: string
  content: string
  timestamp: number
}>

export type NormalizedModerationMessage = Readonly<{
  original: ModerationMessage
  text: string
  comparisonText: string
  analysisText: string
  graphemes: readonly string[]
  emojiCount: number
  emoteCount: number
}>

export type ModerationDetection =
  | {
      rule: "links"
      diagnostics: {
        blocked: number
        invalid: number
        hosts: readonly string[]
      }
    }
  | { rule: "discordInvites"; diagnostics: { count: number } }
  | {
      rule: "uppercase"
      diagnostics: { letters: number; uppercase: number; percentage: number }
    }
  | {
      rule: "emojiSpam"
      diagnostics: {
        emoji: number
        emotes: number
        total: number
        maximum: number
      }
    }
  | {
      rule: "symbolSpam"
      diagnostics: { symbols: number; visible: number; percentage: number }
    }
  | {
      rule: "repeatedCharacters"
      diagnostics: { longestRun: number; minimum: number }
    }
  | {
      rule: "duplicateMessages" | "flooding"
      diagnostics: { count: number; minimum: number; windowMs: number }
    }
  | {
      rule: "repeatedPhrases"
      diagnostics: { repetitions: number; phraseWords: number; minimum: number }
    }
  | { rule: "blockedWords"; diagnostics: { entryIndexes: readonly number[] } }

export type ModerationMatch = ModerationDetection & {
  severity: ModerationSeverity
  action: ModerationAction
}

export type ModerationDecision = Readonly<{
  matched: boolean
  ruleIds: readonly ModerationRuleId[]
  matches: readonly ModerationMatch[]
  severity: "none" | ModerationSeverity
  proposedAction: ModerationAction | Readonly<{ kind: "none" }>
  exemptRuleIds: readonly ModerationRuleId[]
  policyRevision: number
}>
